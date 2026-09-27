import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStudent } from "@/lib/notifications/create";
import { findFifthWeekOpportunities, fifthWeekPrice } from "@/lib/scheduling/fifth-week-offers";
import { fifthWeekNoLesson, fifthWeekOffer } from "@/lib/email/templates/fifth-week";
import { firstNameOf, lessonTimeFields } from "@/lib/ghl/fields";

// Daily (.github/workflows/fifth-week-offers.yml). For every open "bonus
// week" (lib/scheduling/fifth-week-offers.ts): the offer once it's 7 days
// out, then one reminder once it's 2 days out if they still haven't added
// it. Each at most once (notification_log dedup on the occurrence).
// Tara's students get a single "no lesson that week" heads-up instead.
// Stops a few hours before the lesson — too late to sensibly buy.
const DAY = 24 * 60 * 60 * 1000;
const OFFER_DAYS = 7;
const REMINDER_DAYS = 2;
const CUTOFF_HOURS = 6;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const opportunities = await findFifthWeekOpportunities(admin);
  const prices = new Map<number, Awaited<ReturnType<typeof fifthWeekPrice>>>();

  let offers = 0;
  let reminders = 0;
  let noLessonNotices = 0;
  for (const o of opportunities) {
    const msAway = o.occurrenceAt.getTime() - now;
    if (msAway > OFFER_DAYS * DAY || msAway < CUTOFF_HOURS * 60 * 60 * 1000) continue;
    const reminder = msAway <= REMINDER_DAYS * DAY;

    // Tara's students: one "no lesson that week" heads-up instead.
    if (o.noBonusLesson) {
      const w = lessonTimeFields(o.occurrenceAt.toISOString(), o.coachTimezone);
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: o.coachTimezone, weekday: "long" }).format(o.occurrenceAt);
      const r = fifthWeekNoLesson({
        firstName: firstNameOf(o.studentName),
        coachFirstName: firstNameOf(o.coachName),
        lessonDate: w.lessonDate,
        lessonShortDate: w.lessonShortDate,
        lessonDay: w.lessonDay,
        lessonWeekday: weekday,
      });
      await notifyStudent(admin, {
        studentId: o.studentId,
        email: o.email,
        phone: o.phone,
        group: "alerts",
        kind: "fifth_week_offer",
        dedupKey: `student:${o.studentId}:fifth_week_no_lesson:${o.occurrenceAt.toISOString()}`,
        title: r.bellTitle,
        body: r.bellBody,
        linkUrl: "/student/dashboard",
        ghlData: { occurrenceAt: o.occurrenceAt.toISOString(), noLesson: true, ...r },
        channels: { email: o.notifyEmail, sms: o.notifySms, inApp: o.notifyInApp },
      });
      noLessonNotices++;
      continue;
    }

    if (!prices.has(o.durationMinutes)) prices.set(o.durationMinutes, await fifthWeekPrice(o.durationMinutes));
    const price = prices.get(o.durationMinutes) ?? null;
    const w = lessonTimeFields(o.occurrenceAt.toISOString(), o.coachTimezone);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: o.coachTimezone, weekday: "long" }).format(o.occurrenceAt);
    const r = fifthWeekOffer({
      firstName: firstNameOf(o.studentName),
      coachFirstName: firstNameOf(o.coachName),
      lessonDate: w.lessonDate,
      lessonShortDate: w.lessonShortDate,
      lessonDay: w.lessonDay,
      lessonWeekday: weekday,
      lessonTime: w.lessonTime,
      durationMinutes: o.durationMinutes,
      priceLabel: price?.label ?? null,
      reminder,
    });

    await notifyStudent(admin, {
      studentId: o.studentId,
      email: o.email,
      phone: o.phone,
      group: "alerts",
      kind: "fifth_week_offer",
      dedupKey: `student:${o.studentId}:fifth_week_${reminder ? "reminder" : "offer"}:${o.occurrenceAt.toISOString()}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/dashboard",
      ghlData: { occurrenceAt: o.occurrenceAt.toISOString(), ...r },
      channels: { email: o.notifyEmail, sms: o.notifySms, inApp: o.notifyInApp },
    });
    if (reminder) reminders++;
    else offers++;
  }

  return NextResponse.json({ opportunities: opportunities.length, offers, reminders, noLessonNotices });
}
