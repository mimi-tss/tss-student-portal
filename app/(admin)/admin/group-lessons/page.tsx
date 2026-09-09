import { createClient } from "@/lib/supabase/server";
import GroupLessonsClient from "./group-lessons-client";
import styles from "../../admin.module.css";

// Group Lessons — admin-only to create (spec: "can only be added by
// admin"). Students register via a standalone Stripe payment link
// (outside Kajabi entirely), admin manually confirms the payment then
// adds them here — same pattern as purchased-addon session credits.
export default async function AdminGroupLessonsPage() {
  const supabase = await createClient();
  const [{ data: coaches }, { data: students }, { data: credits }] = await Promise.all([
    supabase.from("coaches").select("id, name, timezone").order("name"),
    supabase.from("students").select("id, name").order("name"),
    // Every student's unused, unexpired group-lesson credits — lets the
    // Register control on each lesson offer "use their existing credit"
    // when the selected student has one matching that lesson's topic,
    // the admin-side counterpart to the student's own self-serve
    // redeem-credit flow (app/api/student/group-lessons/redeem-credit).
    supabase
      .from("group_lesson_credits")
      .select("id, student_id, topic")
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Group Lessons</h1>
      <GroupLessonsClient
        coaches={coaches ?? []}
        students={students ?? []}
        credits={(credits ?? []).map((c) => ({ id: c.id, studentId: c.student_id, topic: c.topic }))}
      />
    </main>
  );
}
