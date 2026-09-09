import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyCoachOfGroupLessonSignup,
  registerStudentInGroupLesson,
  unregisterStudentFromGroupLesson,
} from "@/lib/group-lessons";

// Admin manually confirms the Stripe payment came through, then
// registers the student — same posture as purchased-addon session
// credits (migration 0014): no live Stripe integration, no webhook.
//
// `creditId` is the admin-side counterpart to the student's own
// self-serve redeem-credit route: spends an existing unused
// group_lesson_credit instead of a new payment. Same validation (belongs
// to this student, unused, unexpired, topic matches this lesson) as that
// route, just triggered by admin instead of the student.
export async function POST(req: NextRequest) {
  const { groupLessonId, studentId, stripeReference, creditId } = await req.json();

  if (!groupLessonId || !studentId) {
    return NextResponse.json({ error: "groupLessonId and studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  if (creditId) {
    const [{ data: lesson }, { data: credit }] = await Promise.all([
      supabase.from("group_lessons").select("topic").eq("id", groupLessonId).maybeSingle(),
      supabase
        .from("group_lesson_credits")
        .select("id, student_id, topic, used, expires_at")
        .eq("id", creditId)
        .maybeSingle(),
    ]);

    if (!credit || credit.student_id !== studentId) {
      return NextResponse.json({ error: "credit not found" }, { status: 404 });
    }
    if (credit.used) {
      return NextResponse.json({ error: "this credit has already been used" }, { status: 409 });
    }
    if (credit.expires_at && new Date(credit.expires_at) < new Date()) {
      return NextResponse.json({ error: "this credit has expired" }, { status: 409 });
    }
    if (!lesson || lesson.topic !== credit.topic) {
      return NextResponse.json({ error: "this credit can only be used for a matching group class" }, { status: 409 });
    }
  }

  try {
    await registerStudentInGroupLesson(supabase, { groupLessonId, studentId, stripeReference });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't register student" },
      { status: 500 },
    );
  }

  if (creditId) {
    const { error: creditError } = await supabase
      .from("group_lesson_credits")
      .update({ used: true, used_group_lesson_id: groupLessonId })
      .eq("id", creditId);

    if (creditError) {
      return NextResponse.json(
        { error: `registered but marking the credit used failed: ${creditError.message}` },
        { status: 500 },
      );
    }
  }

  // notification_log has no insert policy for a regular session — only
  // ever written by the service-role client (see its own migration
  // comment), so this deliberately uses the admin client, not the
  // RLS-scoped `supabase` above.
  const { data: student } = await supabase.from("students").select("name").eq("id", studentId).maybeSingle();
  if (student) {
    const admin = createAdminClient();
    notifyCoachOfGroupLessonSignup(admin, { groupLessonId, studentId, studentName: student.name }).catch((err) =>
      console.error(`group lesson signup notification failed for lesson ${groupLessonId}`, err),
    );
  }

  return NextResponse.json({ success: true });
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
