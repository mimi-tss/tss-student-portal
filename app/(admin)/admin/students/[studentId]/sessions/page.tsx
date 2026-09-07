import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SessionHistoryClient from "./session-history-client";
import styles from "../../../../admin.module.css";

// Full past-session history for one student — everything /api/sessions/upcoming
// and the "All sessions this billing cycle" panel deliberately leave out
// (older cycles, every status, not just 'scheduled'). Reachable from the
// "See all previous sessions" link on the student's main page.
export default async function StudentSessionHistoryPage({
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
    .maybeSingle();

  if (!student) notFound();

  // Same cap windows AdminCancelButtons already shows on the main student
  // page (calendar month/year, not billing-anniversary) — needed here too
  // since a past-due-but-still-'scheduled' session can go through the same
  // regular-cancel confirm dialog.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [{ data: coaches }, { count: monthlyCreditsUsed }, { count: yearlyCreditsUsed }] =
    await Promise.all([
      supabase.from("coaches").select("id, name").order("name"),
      supabase
        .from("makeup_credits")
        .select("id", { count: "exact", head: true })
        .eq("student_id", student.id)
        .eq("type", "student-fault")
        .gte("created_at", monthStart),
      supabase
        .from("makeup_credits")
        .select("id", { count: "exact", head: true })
        .eq("student_id", student.id)
        .eq("type", "student-fault")
        .gte("created_at", yearStart),
    ]);

  return (
    <div className={styles.wrap}>
      <Link href={`/admin/students/${student.id}`} className={styles.backLink}>
        ← Back to {student.name}
      </Link>
      <h1 className={styles.pageTitle}>{student.name} — previous sessions</h1>
      <SessionHistoryClient
        studentId={student.id}
        coaches={coaches ?? []}
        monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
        yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
      />
    </div>
  );
}
