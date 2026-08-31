import RecordingsClient from "./recordings-client";
import styles from "../../admin.module.css";

// Admin-facing safety net for recordings Meet auto-saved but the app
// couldn't confidently pair to a student on its own (TSS_App_Spec_1.md
// section 7) — see PROGRESS.md for the day-scoped matching design. No
// page-level role check needed — app/(admin)/layout.tsx already gates
// the whole route group.
export default async function RecordingsPage() {
  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Unmatched recordings</h1>
      <RecordingsClient />
    </main>
  );
}
