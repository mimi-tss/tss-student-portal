import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerStudentInGroupLesson, unregisterStudentFromGroupLesson } from "@/lib/group-lessons";

// Admin manually confirms the Stripe payment came through, then
// registers the student — same posture as purchased-addon session
// credits (migration 0014): no live Stripe integration, no webhook.
export async function POST(req: NextRequest) {
  const { groupLessonId, studentId, stripeReference } = await req.json();

  if (!groupLessonId || !studentId) {
    return NextResponse.json({ error: "groupLessonId and studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    await registerStudentInGroupLesson(supabase, { groupLessonId, studentId, stripeReference });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't register student" },
      { status: 500 },
    );
  }
}

// Removes one occurrence's registration — the per-class counterpart to
// SeriesRegisterControl's bulk unregister (register-series/route.ts).
//
// `issueCredit` (admin-checked) mirrors cancel-group-lesson's own —
// removing one student from one occurrence they were signed up for is
// the same "does the studio owe a makeup" judgment call, just scoped to
// one student instead of the whole roster. Same group_lesson_credits
// mechanism, same not-null-topic guard.
export async function DELETE(req: NextRequest) {
  const { registrationId, issueCredit = false } = await req.json();

  if (!registrationId) {
    return NextResponse.json({ error: "registrationId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: registration } = await supabase
    .from("group_lesson_registrations")
    .select("student_id, group_lessons(id, topic)")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "registration not found" }, { status: 404 });
  }

  const lesson = registration.group_lessons as unknown as { id: string; topic: string | null } | { id: string; topic: string | null }[] | null;
  const groupLesson = Array.isArray(lesson) ? lesson[0] : lesson;

  if (issueCredit && !groupLesson?.topic?.trim()) {
    return NextResponse.json(
      { error: "This lesson has no topic set — a credit can't be redeemed without one. Add a topic first, or remove without a credit." },
      { status: 400 },
    );
  }

  try {
    await unregisterStudentFromGroupLesson(supabase, registrationId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't remove that registration" },
      { status: 500 },
    );
  }

  if (issueCredit && groupLesson) {
    const { error: creditError } = await supabase.from("group_lesson_credits").insert({
      student_id: registration.student_id,
      topic: groupLesson.topic as string,
      source_group_lesson_id: groupLesson.id,
      reason: "removed from lesson by admin",
    });

    if (creditError) {
      return NextResponse.json(
        { error: `Removed, but issuing the credit failed: ${creditError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true });
}
