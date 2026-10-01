import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findUnrecordedAttendance } from "@/lib/payroll/calculate";
import { notifySlack } from "@/lib/slack/notify";
import { hasFinanceRole } from "@/lib/auth/roles";
import { formatDateTimeInZone, timezoneAbbreviation } from "@/lib/timezone";

// Admin-triggered nudge for the monthly payroll check: posts to each
// coach's OWN Slack channel listing just their own unmarked sessions
// (date/time in their own timezone, plus student name) — a coach
// shouldn't have to read a combined staff-channel message naming every
// other coach to find their own rows. Recomputes rather than trusting a
// client-supplied list, so the message always reflects the current
// state. A coach with no slack_webhook_url on file is silently skipped
// here (same as notifyCoach elsewhere) but counted separately so the
// admin can tell from the response whether everyone who needed a ping
// actually got one.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { periodStart, periodEnd, coachId } = await req.json();

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "periodStart and periodEnd required" }, { status: 400 });
  }

  const coaches = await findUnrecordedAttendance(supabase, periodStart, periodEnd, coachId || undefined);

  const sessionCount = coaches.reduce((sum, c) => sum + c.sessions.length, 0);
  if (sessionCount === 0) {
    return NextResponse.json({ notified: false, coachCount: 0, sessionCount: 0, missingSlackCoaches: [] });
  }

  const rangeLabel = `${new Date(periodStart).toLocaleDateString()} – ${new Date(periodEnd).toLocaleDateString()}`;
  const missingSlackCoaches: string[] = [];

  await Promise.all(
    coaches.map((c) => {
      if (!c.coachSlackWebhookUrl) {
        missingSlackCoaches.push(c.coachName);
        return Promise.resolve();
      }
      const lines = c.sessions.map((s) => {
        const time = formatDateTimeInZone(s.scheduledAt, c.coachTimezone);
        const zone = timezoneAbbreviation(c.coachTimezone, new Date(s.scheduledAt));
        return `• ${time} ${zone} — ${s.studentName}`;
      });
      const text = `📋 *Payroll attendance check — ${rangeLabel}*\nThese sessions still need attendance marked before payroll runs:\n${lines.join("\n")}`;
      return notifySlack(text, c.coachSlackWebhookUrl);
    }),
  );

  return NextResponse.json({
    notified: true,
    coachCount: coaches.length,
    sessionCount,
    missingSlackCoaches,
  });
}
