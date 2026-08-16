import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CoachChatClient from "./chat-client";

// Coach side of chat (spec section 9/8) — pick an assigned student, then
// the same ChatPanel the student sees on their end.
export default async function CoachChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-4 text-xl font-semibold">Chat</h1>
      <CoachChatClient currentProfileId={user.id} />
    </main>
  );
}
