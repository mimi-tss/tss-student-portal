import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormattedDateTime } from "@/components/formatted-time";
import ProvisionStudentClient from "./provision-student-client";
import StudentTable from "./student-table";
import styles from "../../admin.module.css";

// Admin dashboard: student list (searchable, click a name to view their
// dashboard) with coach assignment, DNC flag, and trial-lesson booking on
// a student's behalf (TSS_App_Spec_1.md section 8).
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ data: students }, { data: coaches }, { data: unusedTrials }, { data: recentBlocks }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, name, email, tier, assigned_coach_id, payment_status")
        .order("name"),
      supabase.from("coaches").select("id, name").eq("active", true).order("name"),
      supabase
        .from("entitlements")
        .select("student_id")
        .eq("perk_type", "trial_lesson")
        .eq("used", false),
      // Currently active or upcoming coach time-off blocks, so admin sees
      // them without needing Slack — a block can be added over
      // already-booked sessions with no automatic conflict check yet.
      supabase
        .from("coach_blocks")
        .select("id, start_at, end_at, reason, coaches(name)")
        .gte("end_at", new Date().toISOString())
        .order("start_at")
        .limit(20),
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

      {recentBlocks && recentBlocks.length > 0 && (
        <div className={styles.panel}>
          <h2>Coach time-off blocks (current &amp; upcoming)</h2>
          <ul className={styles.list}>
            {recentBlocks.map((b) => (
              <li key={b.id} className={styles.listItem}>
                <span className={styles.rowName}>
                  {(b.coaches as unknown as { name: string } | null)?.name}
                </span>{" "}
                <span className={styles.panelText} style={{ display: "inline" }}>
                  <FormattedDateTime value={b.start_at} /> – <FormattedDateTime value={b.end_at} />
                  {b.reason ? ` — ${b.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <StudentTable
        students={students ?? []}
        coaches={coaches ?? []}
        studentsWithUnusedTrial={studentsWithUnusedTrial}
      />
    </main>
  );
}
