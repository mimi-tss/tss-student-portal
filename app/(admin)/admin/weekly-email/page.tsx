import { createAdminClient } from "@/lib/supabase/admin";
import { nextDigestWeekKey } from "@/lib/digest/week";
import { getDigestFeatures, getUpcomingEvents } from "@/lib/digest/content";
import WeeklyEmailEditor from "./weekly-email-editor";
import styles from "../../admin.module.css";

// Studio-written parts of the Monday student digest: up to 2 feature
// boxes for the NEXT digest, plus the standing "What's Coming Up" list.
// Admin-only via app/(admin)/layout.tsx.
export const dynamic = "force-dynamic";

export default async function WeeklyEmailPage() {
  const admin = createAdminClient();
  const weekKey = nextDigestWeekKey();
  const today = new Date().toISOString().slice(0, 10);
  // Tables arrive in migration 0112 — until it's applied these come back empty.
  const [features, events] = await Promise.all([
    getDigestFeatures(admin, weekKey).catch(() => []),
    getUpcomingEvents(admin, today, 100).catch(() => []),
  ]);
  const weekLabel = new Date(`${weekKey}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Weekly Email</h1>
      <WeeklyEmailEditor weekLabel={weekLabel} initialFeatures={features} initialEvents={events} />
    </main>
  );
}
