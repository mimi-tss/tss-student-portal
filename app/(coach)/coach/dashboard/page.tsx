import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import {
  getTodaysSchedule,
  getTodaysGroupLessons,
  getCoachStudents,
  getMakeupsExpiringSoon,
  getBirthdaysThisWeek,
  getStudentSnapshot,
} from "@/lib/coach/dashboard-data";
import { listAssignedExercises } from "@/lib/exercises";
import DashboardClient from "./dashboard-client";
import styles from "../../coach.module.css";

// Coach dashboard: today's schedule (left, collapsible) + a selected
// student's detail panel (right, expands to fill the freed space when
// the schedule is collapsed). See the coach-portal mockup this was
// redesigned against.
export default async function CoachDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student: requestedStudentId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, name, timezone, meet_link")
    .eq("profile_id", user.id)
    .single();
  if (!coach) redirect("/login");

  const timeZone = coach.timezone ?? DEFAULT_TIMEZONE;

  const [today, todayGroupLessons, students, { data: unseenPayroll }] = await Promise.all([
    getTodaysSchedule(supabase, coach.id, timeZone),
    getTodaysGroupLessons(supabase, coach.id, timeZone),
    getCoachStudents(supabase, coach.id),
    // Flags a just-generated payroll run the coach hasn't looked at yet
    // (payroll_entries.coach_seen_at, migration 0048) — cleared the
    // moment they load /coach/payroll and this range is included in
    // what comes back, so this banner naturally disappears once seen
    // rather than needing an explicit dismiss action.
    supabase
      .from("payroll_entries")
      .select("amount, period_start, period_end")
      .eq("coach_id", coach.id)
      .is("coach_seen_at", null),
  ]);

  const newPayroll =
    unseenPayroll && unseenPayroll.length > 0
      ? {
          total: Math.round(unseenPayroll.reduce((sum, e) => sum + e.amount, 0) * 100) / 100,
          count: unseenPayroll.length,
          // period_start/period_end are plain `date` columns — pinned to
          // midnight UTC so they carry the same exclusive-upper-bound
          // convention as every other periodStart/periodEnd in this app
          // (e.g. Finance's own `${endDate}T00:00:00Z`).
          periodStart: `${unseenPayroll.reduce((min, e) => (e.period_start < min ? e.period_start : min), unseenPayroll[0].period_start)}T00:00:00.000Z`,
          periodEnd: `${unseenPayroll.reduce((max, e) => (e.period_end > max ? e.period_end : max), unseenPayroll[0].period_end)}T00:00:00.000Z`,
        }
      : null;

  const studentIds = students.map((s) => s.id);
  const [expiringMakeups, birthdays, catalog] = await Promise.all([
    getMakeupsExpiringSoon(supabase, studentIds),
    getBirthdaysThisWeek(supabase, studentIds),
    supabase.from("exercises").select("id, title").eq("active", true).order("title"),
  ]);

  // Default selection: whatever's requested via ?student=, else the
  // next not-yet-happened session today, else the first today session,
  // else nobody (empty state) — matches the mockup's "already has
  // someone selected on load" behavior without hardcoding a choice.
  const now = new Date();
  const defaultStudentId =
    requestedStudentId ??
    today.find((s) => new Date(s.scheduledAt) >= now)?.studentId ??
    today[0]?.studentId ??
    null;

  let initialSnapshot = null;
  let initialAssignedExercises: Awaited<ReturnType<typeof listAssignedExercises>> = [];
  let initialDriveFolderId: string | null = null;

  if (defaultStudentId) {
    const { data: studentRow } = await supabase
      .from("students")
      .select("drive_folder_id")
      .eq("id", defaultStudentId)
      .maybeSingle();
    initialDriveFolderId = studentRow?.drive_folder_id ?? null;

    [initialSnapshot, initialAssignedExercises] = await Promise.all([
      getStudentSnapshot(supabase, coach.id, defaultStudentId),
      listAssignedExercises(supabase, defaultStudentId),
    ]);
  }

  return (
    <main className={styles.wrap}>
      <DashboardClient
        coachName={coach.name}
        meetLink={coach.meet_link}
        currentProfileId={user.id}
        today={today}
        todayGroupLessons={todayGroupLessons}
        newPayroll={newPayroll}
        expiringMakeups={expiringMakeups}
        birthdays={birthdays}
        catalog={catalog.data ?? []}
        initialStudentId={defaultStudentId}
        initialSnapshot={initialSnapshot}
        initialAssignedExercises={initialAssignedExercises}
        initialDriveFolderId={initialDriveFolderId}
      />
    </main>
  );
}
