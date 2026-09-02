import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanForNewRecordings, runNameMatching, runDayMatching } from "@/lib/admin/recording-matching";
import { notifyStaff } from "@/lib/notifications/create";

// A recording stays unmatched this long after both auto-match passes run
// before it's worth pinging staff about — gives Drive/Gemini a little
// time to finish processing a just-uploaded file before treating it as
// stuck.
const MATCH_FAIL_GRACE_HOURS = 3;

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

  return NextResponse.json({ inserted, nameMatched, dayMatched, autoMatched: nameMatched + dayMatched, matchFailAlerted });
}
