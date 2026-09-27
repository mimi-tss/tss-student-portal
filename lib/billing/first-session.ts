import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStudent } from "@/lib/notifications/create";
import { bonusFirstSession } from "@/lib/email/templates/bonus-first-session";
import { firstNameOf } from "@/lib/ghl/fields";

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

// "You've been granted a BONUS First Session!" — for admin grants (the
// Grant trial buttons, and Add student in comped/manual mode). Email
// always goes out (it's a gift on their account); text and bell follow
// their Alerts settings. Never throws.
export async function notifyBonusFirstSession(
  admin: SupabaseClient,
  studentId: string,
  coachId: string | null | undefined,
): Promise<void> {
  try {
    const [{ data: s }, { data: coach }] = await Promise.all([
      admin
        .from("students")
        .select("name, email, phone, notify_alerts_sms, notify_alerts_inapp")
        .eq("id", studentId)
        .maybeSingle(),
      coachId ? admin.from("coaches").select("name").eq("id", coachId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!s) return;
    const r = bonusFirstSession({
      firstName: firstNameOf(s.name),
      coachFirstName: coach?.name ? firstNameOf(coach.name) : null,
    });
    await notifyStudent(admin, {
      studentId,
      email: s.email,
      phone: s.phone,
      group: "alerts",
      kind: "makeup_credit_needs_scheduling",
      dedupKey: `student:${studentId}:bonus_first_session:${Date.now()}`,
      title: r.bellTitle,
      body: r.bellBody,
      linkUrl: "/student/book",
      ghlData: { ...r },
      channels: { email: true, sms: s.notify_alerts_sms, inApp: s.notify_alerts_inapp },
    });
  } catch (err) {
    console.error(`notifyBonusFirstSession failed for ${studentId}`, err);
  }
}
