import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCoachStudents } from "@/lib/coach/dashboard-data";
import styles from "../../coach.module.css";

const TIER_LABEL: Record<string, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

// "My Students" — a coach's own student list only (never another
// coach's — spec's privacy constraint). Clicking a student opens them in
// the Dashboard's detail panel rather than a separate page, so the
// snapshot/notes/chat/exercises/folder UI lives in exactly one place.
export default async function CoachStudentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", user.id)
    .single();
  if (!coach) redirect("/login");

  const students = await getCoachStudents(supabase, coach.id);

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>My Students</h1>
      <div className={styles.panel}>
        {students.length === 0 ? (
          <p className={styles.panelText}>No students yet.</p>
        ) : (
          <ul className={styles.list}>
            {students.map((s) => (
              <li key={s.id} className={styles.listItem}>
                <Link
                  href={`/coach/dashboard?student=${s.id}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span className={styles.statValue}>{s.name}</span>
                  <span className={styles.badge}>{TIER_LABEL[s.tier] ?? s.tier}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
