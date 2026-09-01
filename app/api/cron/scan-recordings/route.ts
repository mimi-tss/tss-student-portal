import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanForNewRecordings, runNameMatching, runDayMatching } from "@/lib/admin/recording-matching";

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

  return NextResponse.json({ inserted, nameMatched, dayMatched, autoMatched: nameMatched + dayMatched });
}
