import { createClient } from "@/lib/supabase/server";
import GroupLessonsClient from "./group-lessons-client";
import styles from "../../admin.module.css";

// Group Lessons — admin-only to create (spec: "can only be added by
// admin"). Students register via a standalone Stripe payment link
// (outside Kajabi entirely), admin manually confirms the payment then
// adds them here — same pattern as purchased-addon session credits.
export default async function AdminGroupLessonsPage() {
  const supabase = await createClient();
  const [{ data: coaches }, { data: students }] = await Promise.all([
    supabase.from("coaches").select("id, name, timezone").order("name"),
    supabase.from("students").select("id, name").order("name"),
  ]);

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Group Lessons</h1>
      <GroupLessonsClient coaches={coaches ?? []} students={students ?? []} />
    </main>
  );
}
