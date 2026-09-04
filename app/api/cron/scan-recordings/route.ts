import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanForNewRecordings, runNameMatching, runDayMatching } from "@/lib/admin/recording-matching";
import { syncComputedAttentionItems } from "@/lib/admin/attention-items";
import { notifyStaff } from "@/lib/notifications/create";

// A recording stays unmatched this long after both auto-match passes run
// before it's worth pinging staff about — gives Drive/Gemini a little
// time to finish processing a just-uploaded file before treating it as
// stuck.
const MATCH_FAIL_GRACE_HOURS = 3;

// This job is scheduled every 2 hours (.github/workflows/scan-recordings.yml)
// — a gap bigger than this means at least one scheduled run never made it
// to its own success path (auth failure, Vercel outage, quota, anything),
// and Needs Review/Recordings have quietly stopped refreshing with nobody
// aware. Generous margin over the 2h schedule so ordinary scheduling
// jitter never false-alarms. This only catches "a run was skipped or
// failed," not "GitHub Actions itself stopped firing the schedule
// entirely" — that failure mode needs an external uptime check (e.g.
// healthchecks.io), which is outside what this codebase alone can detect.
const HEALTH_CHECK_STALE_HOURS = 4;
const CRON_JOB_NAME = "scan-recordings";

// Runs the exact same scan + auto-match pass the admin Recordings page
// (app/api/admin/meet-recordings/route.ts) triggers on load — pulled
// out so it can also run unattended, on a schedule, via GitHub Actions
// (see .github/workflows/scan-recordings.yml), same reasoning as
// kajabi-sync/materialize-recurring: Vercel Hobby only allows one
// scheduled cron per project via vercel.json, and that slot is already
// spoken for. Previously this only ever ran when an admin happened to
// open the Recordings page — confirmed live this meant recordings
// could sit unmatched (and therefore un-moved into a student's own
// Drive folder) for hours after a lesson, until someone thought to
// check.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Checked first, before any real work — a stale heartbeat means the
  // PREVIOUS scheduled run(s) never made it here, not this one. Dedup
  // key is per-calendar-day, not per-run, so a genuinely broken cron
  // gets one alert a day rather than one every 2 hours.
  const { data: heartbeat } = await admin
    .from("cron_heartbeats")
    .select("last_run_at")
    .eq("job_name", CRON_JOB_NAME)
    .maybeSingle();
  if (heartbeat) {
    const staleCutoff = Date.now() - HEALTH_CHECK_STALE_HOURS * 60 * 60 * 1000;
    if (new Date(heartbeat.last_run_at).getTime() < staleCutoff) {
      const todayStr = new Date().toISOString().slice(0, 10);
      await notifyStaff(admin, {
        kind: "cron_stale",
        dedupKey: `staff:cron_stale:${CRON_JOB_NAME}:${todayStr}`,
        text: `⚠️ ${CRON_JOB_NAME} hasn't completed successfully since ${heartbeat.last_run_at} — Needs Review/Recordings may be stale.`,
      });
    }
  }

  const { inserted } = await scanForNewRecordings(admin);
  // Name-matching first — it doesn't depend on attendance ever being
  // marked (day+session matching does), so it resolves more real cases
  // at this studio right now. Day+session still runs after as a
  // fallback for whatever name-matching couldn't resolve.
  const { matched: nameMatched } = await runNameMatching(admin);
  const { autoMatched: dayMatched } = await runDayMatching(admin);

  // Still unmatched after both passes, and stale enough to be worth a
  // human looking at it. One Slack message per stale recording — dedup is
  // per-recording (notification_log), so a still-unmatched item isn't
  // re-announced every 2h, but a newly-stale one gets its own alert.
  const staleCutoff = new Date(Date.now() - MATCH_FAIL_GRACE_HOURS * 60 * 60 * 1000);
  const { data: stale } = await admin
    .from("meet_recordings")
    .select("id, file_name, coaches(name)")
    .eq("status", "unmatched")
    .lte("drive_created_at", staleCutoff.toISOString());

  let matchFailAlerted = 0;
  for (const r of stale ?? []) {
    const coach = Array.isArray(r.coaches) ? r.coaches[0] : r.coaches;
    const coachName = (coach as { name: string } | null)?.name ?? "unknown coach";
    await notifyStaff(admin, {
      kind: "recording_match_fail",
      dedupKey: `staff:recording_match_fail:${r.id}`,
      text: `Recording needs manual review — no auto-match found: ${r.file_name} (${coachName})`,
    });
    matchFailAlerted++;
  }

  // Reconciles recording_missing/recording_unmatched (plus the other 5
  // condition-driven kinds) here too, not just when an admin happens to
  // open Needs Review — confirmed live a gap can otherwise sit
  // unnoticed for days. Needs migration 0088 applied first: the
  // attention_item_upsert_* RPCs (0082) reject any caller without a
  // real admin session, service-role included, until that migration
  // grants an explicit service-role allowance — this call is a no-op
  // (every upsert silently fails its own is_admin() check) until then.
  await syncComputedAttentionItems(admin);

  // Recorded last, only once every step above has actually completed —
  // an error thrown partway through this handler means this line never
  // runs, which is exactly the signal the next run's own check above
  // needs to see.
  await admin
    .from("cron_heartbeats")
    .upsert({ job_name: CRON_JOB_NAME, last_run_at: new Date().toISOString() });

  return NextResponse.json({ inserted, nameMatched, dayMatched, autoMatched: nameMatched + dayMatched, matchFailAlerted });
}
