import styles from "../../coach.module.css";
import ScheduleClient from "./schedule-client";

// "My Schedule" — full calendar grid for attendance marking, plus an
// attendance/payroll summary for whatever range the calendar above is
// currently showing (day or week). Payroll no longer has its own nav
// item — this page is where a coach now finds it (spec: nav is just
// Dashboard / My Schedule / My Students / Courses / Community).
export default function CoachSchedulePage() {
  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>My Schedule</h1>
      <ScheduleClient />
    </main>
  );
}
