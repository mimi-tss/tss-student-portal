import type { SupabaseClient } from "@supabase/supabase-js";

// Suite's "First 1:1 Coaching Session" is for genuinely new students only
// (studio call 2026-09-26): never someone who has had ANY session with us
// before (a returning student, or a Pro/Elite member downgrading to
// Suite), and never twice. Used by every place that grants the trial or
// promises it in an email.
export async function isFirstSessionEligible(admin: SupabaseClient, studentId: string): Promise<boolean> {
  const [{ count: sessions }, { count: trials }] = await Promise.all([
    admin.from("sessions").select("id", { count: "exact", head: true }).eq("student_id", studentId),
    admin
      .from("entitlements")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("perk_type", "trial_lesson"),
  ]);
  return (sessions ?? 0) === 0 && (trials ?? 0) === 0;
}
