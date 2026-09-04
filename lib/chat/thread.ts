import type { SupabaseClient } from "@supabase/supabase-js";

// Every chat_threads row is still exactly one per student (see 0092's
// own comment — access to a shared student is additive via RLS, not via
// multiple threads). This only ever creates the FIRST one for a student
// who's never had any coach relationship trigger it yet — the
// create_chat_thread_on_coach_assignment trigger (0013) only fires on
// assigned_coach_id being set, which a pure group-lesson-only student
// never has happen. seedCoachId just satisfies the row's required
// not-null column; actual read/write access is governed entirely by the
// additive RLS policies (0022/0092), not by this value, so it's fine
// for it to simply be whichever coach first messaged them.
export async function getOrCreateThreadId(
  admin: SupabaseClient,
  studentId: string,
  seedCoachId: string,
): Promise<string> {
  const { data: existing } = await admin.from("chat_threads").select("id").eq("student_id", studentId).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from("chat_threads")
    .insert({ student_id: studentId, coach_id: seedCoachId })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "couldn't start a chat thread");
  return created.id;
}

// Whether this coach currently has (or has ever had) a legitimate
// relationship with this student — assigned, a real 1:1 session history,
// or a group-lesson registration — the same three sources
// auth_coach_student_ids()/auth_coach_group_lesson_student_ids() (0007/
// 0092) combine for read/write access to an EXISTING thread. Used here
// with the admin client to decide whether a coach may lazily start a
// brand-new one: chat_threads has no INSERT policy at all (0013 — only
// ever written by the assigned-coach trigger), so this can't be
// expressed as RLS the way read/write-to-an-existing-thread already is.
export async function coachHasAccessToStudent(
  admin: SupabaseClient,
  coachId: string,
  studentId: string,
): Promise<boolean> {
  const [{ data: assigned }, { data: session }, { data: groupReg }] = await Promise.all([
    admin.from("students").select("id").eq("id", studentId).eq("assigned_coach_id", coachId).maybeSingle(),
    admin.from("sessions").select("id").eq("student_id", studentId).eq("actual_coach_id", coachId).limit(1).maybeSingle(),
    admin
      .from("group_lesson_registrations")
      .select("id, group_lessons!inner(coach_id)")
      .eq("student_id", studentId)
      .eq("group_lessons.coach_id", coachId)
      .limit(1)
      .maybeSingle(),
  ]);
  return !!(assigned || session || groupReg);
}
