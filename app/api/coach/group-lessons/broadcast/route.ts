import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateThreadId } from "@/lib/chat/thread";
import { notifyChatRecipient } from "@/lib/chat/notify";

function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

interface RegistrationRow {
  student_id: string;
  students: { id: string; name: string } | { id: string; name: string }[] | null;
}

// Coach's "message the whole class at once" action on today's group
// lesson (Coach Dashboard) — fans one typed message out as an
// INDIVIDUAL chat_messages row into each registered student's own
// thread, never a shared group thread all students would see each other
// in (this app still has exactly one thread per student — see migration
// 0092's own comment on why). Each student just replies normally in
// their own existing chat afterward; no new reply-side plumbing needed.
//
// Includes every registration regardless of status (registered/attended/
// no-show) — same reasoning as the group-lesson recording fan-out
// (lib/admin/recording-matching.ts's attachRecordingToGroupLesson): a
// no-show should still be reachable for a "sorry we missed you" message.
export async function POST(req: NextRequest) {
  const { groupLessonId, message } = await req.json();
  if (!groupLessonId || !message || !message.trim()) {
    return NextResponse.json({ error: "groupLessonId and a message are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: coach } = await supabase.from("coaches").select("id").eq("profile_id", user.id).maybeSingle();
  if (!coach) return NextResponse.json({ error: "no coach record" }, { status: 404 });

  const admin = createAdminClient();

  // Re-derives the roster server-side from groupLessonId rather than
  // trusting a client-submitted student list, same posture as every
  // other bulk action in this app. eq("coach_id", coach.id) in the same
  // query both verifies ownership and finds the lesson in one round
  // trip — a null result means either it doesn't exist or isn't this
  // coach's, same as this app's other ownership-checked routes.
  const { data: lesson } = await admin
    .from("group_lessons")
    .select("id, topic, coach_id, cancelled_at, group_lesson_registrations(student_id, students(id, name))")
    .eq("id", groupLessonId)
    .eq("coach_id", coach.id)
    .maybeSingle();

  if (!lesson) return NextResponse.json({ error: "group lesson not found" }, { status: 404 });
  if (lesson.cancelled_at) return NextResponse.json({ error: "that class was cancelled" }, { status: 409 });

  const registrations = (lesson.group_lesson_registrations as unknown as RegistrationRow[] | null) ?? [];
  const students = registrations
    .map((r) => unwrap(r.students))
    .filter((s): s is { id: string; name: string } => !!s);

  if (students.length === 0) {
    return NextResponse.json({ error: "no students are registered for that class" }, { status: 400 });
  }

  const body = message.trim();
  let sent = 0;
  const failed: string[] = [];

  for (const student of students) {
    try {
      const threadId = await getOrCreateThreadId(admin, student.id, coach.id);
      const { error } = await admin.from("chat_messages").insert({
        thread_id: threadId,
        sender_profile_id: user.id,
        body,
      });
      if (error) throw new Error(error.message);
      sent++;

      // Fire-and-forget per student — one notification hiccup can't
      // block the rest of the class from getting their message.
      notifyChatRecipient(threadId, "coach", body).catch((err) =>
        console.error(`group broadcast notification failed for student ${student.id}`, err),
      );
    } catch (err) {
      console.error(`group broadcast failed for student ${student.id} (lesson ${groupLessonId})`, err);
      failed.push(student.name);
    }
  }

  return NextResponse.json({ success: true, sent, total: students.length, failed });
}
