import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatPanel from "@/components/chat-panel";
import styles from "../../student.module.css";

// Chat with your assigned coach (spec section 9) — thread is
// auto-created the moment a coach is assigned, so a student with none
// yet simply has nothing to show here.
export default async function StudentChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("students")
    .select("id, assigned_coach_id")
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  return (
    <div className={styles.wrap} style={{ maxWidth: 720 }}>
      <div className={styles.sectionTitle} style={{ marginTop: 32 }}>
        <h2>Chat with your coach</h2>
      </div>
      {student.assigned_coach_id ? (
        <ChatPanel studentId={student.id} currentProfileId={user.id} dark />
      ) : (
        <p className={styles.panelText}>
          You&apos;ll be able to chat here once a coach is assigned to you.
        </p>
      )}
    </div>
  );
}
