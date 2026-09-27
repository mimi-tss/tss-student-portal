import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedYearMonthDay, zonedTimeToUtc } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { notifyStudent, notifyStaff } from "@/lib/notifications/create";
import { getAttentionItems } from "@/lib/admin/attention-items";
import { buildDigestRecipients } from "@/lib/digest/build";
import { getDigestFeatures, getUpcomingEvents } from "@/lib/digest/content";
import { weeklyDigest } from "@/lib/email/templates/weekly-digest";

export const maxDuration = 60;

// Monday ~8am ET (.github/workflows/weekly-digest.yml, fixed UTC hour —
// same no-DST-awareness precedent as materialize-recurring.yml). Sends
// two things in one run: the student personal digest (email only) and
// the staff weekly ops summary (shared
// channel). No coach digest — coaches get event-driven Slack pings
// instead (booked/cancelled, recording ready, chat messages — see
// lib/notifications/session-events.ts and app/api/chat/messages/route.ts),
// not a weekly summary. Both dedup on the same Monday date key, so a
// re-run within the day is a no-op.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [y, m, d] = zonedYearMonthDay(new Date(), DEFAULT_TIMEZONE);
  const weekStart = zonedTimeToUtc(y, m, d, 0, 0, DEFAULT_TIMEZONE);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Studio boxes + "What's Coming Up" (admin → Weekly Email) are the same
  // for everyone; the rest is per student (lib/digest/build.ts — the same
  // builder the admin "Preview as" uses).
  const [recipients, features, upcoming] = await Promise.all([
    buildDigestRecipients(admin, { weekStart }),
    getDigestFeatures(admin, weekKey).catch(() => []),
    getUpcomingEvents(admin, weekKey).catch(() => []),
  ]);

  // Email only (studio call 2026-09-26): no text, no bell. Everyone on a
  // digest plan gets it — a quiet week still shows the "grab a time"
  // nudge plus the studio's boxes and upcoming events.
  let studentsNotified = 0;
  for (const r of recipients) {
    if (!r.emailOn) continue;
    const rendered = weeklyDigest({ ...r.data, features, upcoming });
    await notifyStudent(admin, {
      studentId: r.id,
      email: r.email,
      phone: r.phone,
      group: "digest",
      kind: "weekly_digest",
      dedupKey: `student:${r.id}:weekly_digest:${weekKey}`,
      title: rendered.bellTitle,
      body: rendered.bellBody,
      linkUrl: "/student/dashboard",
      ghlData: { ...rendered, weekStart: weekKey },
      channels: { email: true, sms: false, inApp: false },
    });
    studentsNotified++;
  }

  const { count: totalSessions } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled")
    .gte("scheduled_at", weekStart.toISOString())
    .lt("scheduled_at", weekEnd.toISOString());

  const backlog = await getAttentionItems(admin, "needs_action");
  const opsText = [
    "*Weekly ops summary*",
    `${totalSessions ?? 0} sessions scheduled this week`,
    `${backlog.length} item${backlog.length === 1 ? "" : "s"} in Needs Review`,
  ].join("\n");

  await notifyStaff(admin, {
    kind: "weekly_ops_summary",
    dedupKey: `staff:weekly_ops_summary:${weekKey}`,
    text: opsText,
  });

  return NextResponse.json({ studentsNotified, weekKey });
}
