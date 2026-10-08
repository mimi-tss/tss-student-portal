import Link from "next/link";
import styles from "../../student.module.css";

// Shown on the dashboard and book page to a Pro/Elite student who has no
// weekly lesson yet, pointing them at self-setup.
export default function WeeklySetupBanner() {
  return (
    <div className={styles.panel} style={{ marginTop: 24, marginBottom: 24 }}>
      <h2 style={{ margin: "0 0 8px" }}>Set up your weekly lesson</h2>
      <p className={styles.panelText} style={{ margin: "0 0 12px" }}>
        Pick your coach and a regular time each week. It takes about a minute.
      </p>
      <Link href="/student/weekly-lesson" className={styles.cta}>
        Choose my weekly time
      </Link>
    </div>
  );
}
