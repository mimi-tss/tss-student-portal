import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookingClient from "@/app/(student)/student/book/booking-client";
import styles from "../../../admin.module.css";

// Admin books a Suite student's one-time trial lesson on their behalf
// (TSS_App_Spec_1.md section 8) — reuses the exact same booking UI and
// API routes the student would use themselves; the "admins can insert
// sessions" RLS policy (0005 migration) is what makes that work for an
// admin session, not a service-role bypass.
export default async function AdminBookTrialPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, name")
    .eq("id", studentId)
    .single();

  if (!student) redirect("/admin/dashboard");

  const { data: entitlement } = await supabase
    .from("entitlements")
    .select("used, coach_id")
    .eq("student_id", studentId)
    .eq("perk_type", "trial_lesson")
    .maybeSingle();

  if (!entitlement || entitlement.used) redirect("/admin/dashboard");

  return (
    <div>
      <p className={styles.mutedText} style={{ padding: "32px 32px 0" }}>
        Booking trial lesson for <strong>{student.name}</strong>
      </p>
      {/* Same coach-lock as the student's own booking page (migration
          0093) — if this trial was granted for a specific coach, admin
          books against that same coach too, straight to date/time. */}
      <BookingClient studentId={studentId} mode="trial" coachId={entitlement.coach_id} />
    </div>
  );
}
