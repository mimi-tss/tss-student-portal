import { createClient } from "@/lib/supabase/server";
import AllCoachesDayClient from "./all-coaches-day-client";
import styles from "../../admin.module.css";

// Coaches page — day-by-day schedule across every coach at once (each
// coach is a column), plus a trimmed roster below for reference.
// Deliberately never selects hourly_rate: admin didn't want pay visible
// here (it still lives in Payroll).
export default async function AdminCoachesPage() {
  const supabase = await createClient();
  const [{ data: coaches }, { data: students }] = await Promise.all([
    supabase
      .from("coaches")
      .select(
        "id, name, email, timezone, hidden_from_students, working_hours, pending_working_hours, pending_effective_date, active, meet_link, drive_folder_id",
      )
      .order("name"),
    supabase.from("students").select("assigned_coach_id").not("assigned_coach_id", "is", null),
  ]);

  const studentCounts = new Map<string, number>();
  for (const s of students ?? []) {
    if (!s.assigned_coach_id) continue;
    studentCounts.set(s.assigned_coach_id, (studentCounts.get(s.assigned_coach_id) ?? 0) + 1);
  }

  const coachRows = (coaches ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    timezone: c.timezone,
    hiddenFromStudents: c.hidden_from_students,
    workingHours: c.working_hours as Record<string, [string, string][]>,
    pendingWorkingHours: c.pending_working_hours as Record<string, [string, string][]> | null,
    pendingEffectiveDate: c.pending_effective_date as string | null,
    studentCount: studentCounts.get(c.id) ?? 0,
    active: c.active,
    meetLink: c.meet_link as string | null,
    driveFolderId: c.drive_folder_id as string | null,
  }));

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Coaches</h1>
      <AllCoachesDayClient coaches={coachRows} />
    </div>
  );
}
