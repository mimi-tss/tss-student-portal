import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatPanel from "@/components/chat-panel";

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
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-4 text-xl font-semibold">Chat with your coach</h1>
      {student.assigned_coach_id ? (
        <ChatPanel studentId={student.id} currentProfileId={user.id} />
      ) : (
        <p className="text-gray-500">
          You&apos;ll be able to chat here once a coach is assigned to you.
        </p>
      )}
    </main>
  );
}
