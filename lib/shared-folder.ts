import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Shared folder access (coach dashboard spec): student, their coach (past
// or present — same "ever had a real session" scoping as chat/notes), and
// admin can all upload/shortcut/remove. Resolves the caller's role and
// the target student's drive_folder_id in one place so the three API
// routes (upload/shortcut/remove) can't drift on who's allowed.
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

  if (profile?.role === "admin") {
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

  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("actual_coach_id", coach.id);

  return { allowed: (count ?? 0) > 0, folderId: student.drive_folder_id };
}
