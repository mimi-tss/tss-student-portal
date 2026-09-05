import type { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Shared folder access (coach dashboard spec): student, their coach (past
// or present, 1:1 or group-lesson — same scoping as chat/exercises/
// homework notes, migration 0092/0094), and admin can all upload/
// shortcut/remove. Resolves the caller's role and the target student's
// drive_folder_id in one place so the three API routes (upload/
// shortcut/remove) can't drift on who's allowed.
export async function resolveFolderAccess(
  supabase: SupabaseClient,
  userId: string,
  studentId: string,
): Promise<{ allowed: boolean; folderId: string | null }> {
  const { data: student } = await supabase
    .from("students")
    .select("profile_id, drive_folder_id, assigned_coach_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) return { allowed: false, folderId: null };

  if (student.profile_id === userId) {
    return { allowed: true, folderId: student.drive_folder_id };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (isAdminRole(profile?.role)) {
    return { allowed: true, folderId: student.drive_folder_id };
  }

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();

  if (!coach) return { allowed: false, folderId: null };

  if (student.assigned_coach_id === coach.id) {
    return { allowed: true, folderId: student.drive_folder_id };
  }

  const [{ count: sessionCount }, { count: groupCount }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("actual_coach_id", coach.id),
    // Same "ever taught this student" scoping as chat/exercises/homework
    // notes (auth_coach_group_lesson_student_ids(), migration 0092) —
    // a coach whose only relationship to this student is a group class
    // previously had no path to their shared folder at all.
    supabase
      .from("group_lesson_registrations")
      .select("id, group_lessons!inner(coach_id)", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("group_lessons.coach_id", coach.id),
  ]);

  return { allowed: (sessionCount ?? 0) > 0 || (groupCount ?? 0) > 0, folderId: student.drive_folder_id };
}
