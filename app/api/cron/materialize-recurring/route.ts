import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoResumeExpiredPauses, materializeRecurringSessions } from "@/lib/scheduling/recurring";

// Daily top-up: ensures every active recurring schedule has real
// `sessions` rows out to the horizon (lib/scheduling/recurring.ts). Runs
// via GitHub Actions, same pattern as kajabi-sync (see that route's
// comment for why: Vercel Hobby only allows a daily cron per job, and
// the existing Vercel cron slot is already used).
//
// Auto-resume runs first, in the same pass — a student whose pause end
// date is now in the past gets flipped back to active before
// materializing, so their recurring slot starts refilling again on the
// same run rather than waiting a day.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const resumed = await autoResumeExpiredPauses(admin);
  const result = await materializeRecurringSessions(admin);

  return NextResponse.json({ resumed, ...result });
}
