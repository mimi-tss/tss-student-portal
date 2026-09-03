import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { listAllCandidateSessions, listAllCandidateGroupLessons } from "@/lib/admin/recording-matching";

// Pure read — just shows whatever's currently in meet_recordings. Used
// to also trigger the full scan + name-match + day-match pass inline,
// which is exactly what was making this page unusable: confirmed live
// that pass alone can take 10-25s+ depending on backlog size (Drive/
// Gemini API calls, one per unmatched recording), reliably exceeding
// this route's execution budget and failing with an empty 500 before
// ever returning a list — so the manual picker below couldn't even
// render, let alone be used. Scanning/matching now happens in the
// background instead (.github/workflows/scan-recordings.yml, every 2
// hours, hitting /api/cron/scan-recordings) — this route no longer
// needs to do any of that work itself, so it's back to being a plain,
// fast, always-reliable read.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const admin = createAdminClient();

  const [{ data: unmatched }, { data: matchedRows }] = await Promise.all([
    admin
      .from("meet_recordings")
      .select("id, coach_id, drive_file_id, file_name, recorded_date, drive_created_at, coaches(name)")
      .eq("status", "unmatched")
      .order("recorded_date", { ascending: false }),
    admin.from("meet_recordings").select("matched_session_id, matched_group_lesson_id").eq("status", "matched"),
  ]);

  const alreadyMatchedSessionIds = new Set(
    (matchedRows ?? []).map((r) => r.matched_session_id as string).filter(Boolean),
  );
  const alreadyMatchedGroupLessonIds = new Set(
    (matchedRows ?? []).map((r) => r.matched_group_lesson_id as string).filter(Boolean),
  );

  const items = await Promise.all(
    (unmatched ?? []).map(async (rec) => {
      const coachName = (rec.coaches as unknown as { name: string } | null)?.name ?? null;
      const [candidates, groupLessonCandidates] = rec.coach_id
        ? await Promise.all([
            listAllCandidateSessions(admin, rec.coach_id, alreadyMatchedSessionIds),
            listAllCandidateGroupLessons(admin, rec.coach_id, alreadyMatchedGroupLessonIds),
          ])
        : [[], []];
      return {
        id: rec.id,
        driveFileId: rec.drive_file_id,
        fileName: rec.file_name,
        recordedDate: rec.recorded_date,
        driveCreatedAt: rec.drive_created_at,
        coachId: rec.coach_id,
        coachName,
        candidates,
        groupLessonCandidates,
      };
    }),
  );

  return NextResponse.json({ items });
}
