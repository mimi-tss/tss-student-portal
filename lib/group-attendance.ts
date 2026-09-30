import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by the coach and admin group-attendance routes. Sets (or clears)
// the missed-group-session email's 2-hour grace clock alongside the
// status. If migration 0115 isn't applied yet, the column doesn't exist —
// retry without it so marking attendance never breaks because of the
// email feature.
export async function updateGroupAttendance(supabase: SupabaseClient, registrationId: string, status: string) {
  const withClock = { status, no_show_marked_at: status === "no-show" ? new Date().toISOString() : null };
  const first = await supabase.from("group_lesson_registrations").update(withClock).eq("id", registrationId).select("id, student_id").maybeSingle();
  if (first.error && /no_show_marked_at/.test(first.error.message)) {
    return supabase.from("group_lesson_registrations").update({ status }).eq("id", registrationId).select("id, student_id").maybeSingle();
  }
  return first;
}
