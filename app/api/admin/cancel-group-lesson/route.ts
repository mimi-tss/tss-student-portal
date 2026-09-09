import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Soft-cancel (see migration 0043_group_lesson_cancel.sql) — never a
// delete. Group-lesson payment is already manual/informal (no live
// Stripe integration, just a stripe_reference note admin fills in), so
// refunding a cancelled lesson's paid attendees is handled the same
// way: directly with the student, outside the app, not automated here.
//
// `issueCredit` (admin-checked) is the manual-cancel equivalent of what
// the group-lesson-understaffed cron already does automatically for its
// own auto-cancels — same group_lesson_credits table, same "same topic,
// redeemable against a future occurrence" shape (lib/group-lesson-credits.ts).
// Whether to grant one is genuinely case-by-case (a studio mistake vs. a
// student no-show en masse), so this is admin's call each time, not a
// fixed rule.
export async function POST(req: NextRequest) {
  const { groupLessonId, reason, issueCredit = false } = await req.json();

  if (!groupLessonId || !reason || !reason.trim()) {
    return NextResponse.json({ error: "groupLessonId and a reason are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: lesson } = await supabase
    .from("group_lessons")
    .select("id, cancelled_at, topic, group_lesson_registrations(student_id, status)")
    .eq("id", groupLessonId)
    .maybeSingle();

  if (!lesson) return NextResponse.json({ error: "group lesson not found" }, { status: 404 });
  if (lesson.cancelled_at) return NextResponse.json({ error: "already cancelled" }, { status: 409 });

  const registeredStudentIds = (
    (lesson.group_lesson_registrations as unknown as { student_id: string; status: string }[] | null) ?? []
  )
    .filter((r) => r.status === "registered")
    .map((r) => r.student_id);

  // A credit is redeemed by matching topic (getRedeemableGroupLessons) and
  // the column itself is not-null — an untitled lesson has nothing for a
  // credit to ever resolve against, so reject up front rather than insert
  // one nobody could actually use.
  if (issueCredit && !lesson.topic?.trim()) {
    return NextResponse.json(
      { error: "This lesson has no topic set — a credit can't be redeemed without one. Add a topic first, or cancel without a credit." },
      { status: 400 },
    );
  }

  const { data: updated, error } = await supabase
    .from("group_lessons")
    .update({ cancelled_at: new Date().toISOString(), cancel_reason: reason.trim() })
    .eq("id", groupLessonId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "No group lesson was updated — check admin RLS on group_lessons." }, { status: 403 });
  }

  let creditsIssued = 0;
  if (issueCredit && registeredStudentIds.length > 0) {
    const { data: insertedCredits, error: creditError } = await supabase
      .from("group_lesson_credits")
      .insert(
        registeredStudentIds.map((studentId) => ({
          student_id: studentId,
          topic: lesson.topic as string,
          source_group_lesson_id: groupLessonId,
          reason: reason.trim(),
        })),
      )
      .select("id");

    if (creditError) {
      return NextResponse.json(
        { error: `Lesson cancelled, but issuing credits failed: ${creditError.message}` },
        { status: 500 },
      );
    }
    creditsIssued = insertedCredits?.length ?? registeredStudentIds.length;
  }

  // admin_overrides is per-student (required student_id) and a group
  // lesson has many attendees, not one — doesn't fit that table, so the
  // reason is persisted directly on group_lessons (migration 0086)
  // instead.
  return NextResponse.json({ success: true, creditsIssued });
}
