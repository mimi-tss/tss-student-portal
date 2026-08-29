import ActivityLogClient from "./activity-log-client";
import styles from "../../admin.module.css";

// Who did what, and when — a trigger-captured field-level diff of
// sensitive tables (audit_log) plus app-logged logins and
// join-session clicks (activity_events). No page-level role check
// needed — app/(admin)/layout.tsx already gates the whole route group
// to admin/admin_finance, same as every other non-Finance admin page.
// See PROGRESS.md for the design rationale (why a Postgres trigger
// instead of instrumenting every write route, why this stays in-app
// instead of a separate tool).
export default async function ActivityLogPage() {
  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Activity log</h1>
      <ActivityLogClient />
    </main>
  );
}
