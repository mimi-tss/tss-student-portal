import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProvisionStudentClient from "./provision-student-client";
import ImportStudentsClient from "./import-students-client";
import StudentTable from "./student-table";
import styles from "../../admin.module.css";

// Admin dashboard: student list (searchable, click a name to view their
// dashboard) with coach assignment, DNC flag, and trial-lesson booking on
// a student's behalf (TSS_App_Spec_1.md section 8).
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ data: students }, { data: coaches }, { data: unusedTrials }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, email, tier, assigned_coach_id, payment_status")
      .order("name"),
    supabase.from("coaches").select("id, name, timezone").eq("active", true).order("name"),
    supabase
      .from("entitlements")
      .select("student_id")
      .eq("perk_type", "trial_lesson")
      .eq("used", false),
  ]);

  const studentsWithUnusedTrial = (unusedTrials ?? []).map((e) => e.student_id);

  return (
    <main className={styles.wrap}>
      <div className={styles.pageHeadRow}>
        <h1 className={styles.pageTitle}>Students</h1>
        <Link href="/admin/coaches" className={styles.linkBtn}>
          View coach schedules →
        </Link>
      </div>

      <ProvisionStudentClient coaches={coaches ?? []} />

      <ImportStudentsClient />

      <StudentTable
        students={students ?? []}
        coaches={coaches ?? []}
        studentsWithUnusedTrial={studentsWithUnusedTrial}
      />
    </main>
  );
}
