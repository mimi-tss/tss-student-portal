import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CoachChatClient from "./chat-client";
import styles from "../../coach.module.css";

// Coach side of chat (spec section 9/8) — pick an assigned student, then
// the same ChatPanel the student sees on their end.
export default async function CoachChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Chat</h1>
      <CoachChatClient currentProfileId={user.id} />
    </main>
  );
}
