import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoResumeExpiredPauses, materializeRecurringSessions } from "@/lib/scheduling/recurring";
import { materializeRecurringGroupLessons } from "@/lib/group-lessons";
import { forfeitHolidaySessions } from "@/lib/scheduling/holidays";

// Daily top-up: ensures every active recurring schedule has real
// `sessions` rows out to the horizon (lib/scheduling/recurring.ts), and
// every active recurring group lesson series has real `group_lessons`
// rows out to the same horizon (lib/group-lessons.ts). Folded into one
// cron run rather than standing up a second scheduled workflow — runs
// via GitHub Actions, same pattern as kajabi-sync (see that route's
// comment for why: Vercel Hobby only allows a daily cron per job, and
// the existing Vercel cron slot is already used).
//
// Auto-resume runs first, in the same pass — a student whose pause end
// date is now in the past gets flipped back to active before
// materializing, so their recurring slot starts refilling again on the
// same run rather than waiting a day.
//
// The holiday forfeit sweep also runs before materializing — catches
// anything already sitting on a studio_holidays date (whether it
// predates this feature or a date was just added) before this same run
// tries to top up the horizon, and materializeRecurringSessions'/
// materializeRecurringGroupLessons' own holiday filter stops any new
// occurrence from ever landing there again.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const resumed = await autoResumeExpiredPauses(admin);
  const holidayForfeit = await forfeitHolidaySessions(admin);
  const result = await materializeRecurringSessions(admin);
  const groupLessonResult = await materializeRecurringGroupLessons(admin);

  return NextResponse.json({
    resumed,
    ...holidayForfeit,
    ...result,
    groupLessonsCreated: groupLessonResult.created,
  });
}
