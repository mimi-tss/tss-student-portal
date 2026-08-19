import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { materializeRecurringSessions } from "@/lib/scheduling/recurring";

// Daily top-up: ensures every active recurring schedule has real
// `sessions` rows out to the horizon (lib/scheduling/recurring.ts). Runs
// via GitHub Actions, same pattern as kajabi-sync (see that route's
// comment for why: Vercel Hobby only allows a daily cron per job, and
// the existing Vercel cron slot is already used).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await materializeRecurringSessions(admin);

  return NextResponse.json(result);
}
