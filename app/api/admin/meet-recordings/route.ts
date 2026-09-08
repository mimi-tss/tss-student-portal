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

  // A short, recent-only window — same "don't recreate an overwhelming
  // queue" reasoning as every other lookback in this file (see
  // RECORDING_MISSING_LOOKBACK_DAYS/CANDIDATE_LOOKBACK_DAYS). This list
  // only exists to make a wrong match (see unmatchRecording) fixable
  // soon after it happens, not to be a full historical audit log.
  const recentlyMatchedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: unmatched }, { data: matchedRows }, { data: recentlyMatchedRows }] = await Promise.all([
    admin
      .from("meet_recordings")
      .select("id, coach_id, drive_file_id, file_name, recorded_date, drive_created_at, coaches(name)")
      .eq("status", "unmatched")
      .order("recorded_date", { ascending: false }),
    admin.from("meet_recordings").select("matched_session_id, matched_group_lesson_id").eq("status", "matched"),
    admin
      .from("meet_recordings")
      .select(
        "id, file_name, recorded_date, matched_at, match_method, coaches(name), students:matched_student_id(name), group_lessons:matched_group_lesson_id(topic)",
      )
      .eq("status", "matched")
      .gte("matched_at", recentlyMatchedCutoff)
      .order("matched_at", { ascending: false }),
  ]);

  const recentlyMatched = (recentlyMatchedRows ?? []).map((r) => ({
    id: r.id,
    fileName: r.file_name,
    recordedDate: r.recorded_date,
    matchedAt: r.matched_at,
    matchMethod: r.match_method,
    coachName: (r.coaches as unknown as { name: string } | null)?.name ?? null,
    matchedTo:
      (r.students as unknown as { name: string } | null)?.name ??
      (r.group_lessons as unknown as { topic: string | null } | null)?.topic ??
      "Group lesson",
  }));

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

  return NextResponse.json({ items, recentlyMatched });
}
