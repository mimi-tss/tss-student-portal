import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Redeems a group_lesson_credit (migration 0086) into a real
// group_lesson_registrations row — the student's own self-service
// counterpart to admin's register route
// (app/api/admin/group-lessons/register). Ownership/eligibility is
// verified here in application code with the user's own session, then
// the actual cross-student reads/writes (capacity, other students'
// registrations) go through the admin client — same posture as
// app/api/shared-folder/notify-upload/route.ts. Sequential, non-atomic
// writes (insert registration, then mark the credit used), same accepted
// gap as app/api/booking/book/route.ts's credit consumption.
export async function POST(req: NextRequest) {
  const { creditId, groupLessonId } = await req.json();
  if (!creditId || !groupLessonId) {
    return NextResponse.json({ error: "creditId and groupLessonId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const admin = createAdminClient();

  const { data: credit } = await admin
    .from("group_lesson_credits")
    .select("id, student_id, topic, used, expires_at")
    .eq("id", creditId)
    .maybeSingle();

  if (!credit || credit.student_id !== student.id) {
    return NextResponse.json({ error: "credit not found" }, { status: 404 });
  }
  if (credit.used) {
    return NextResponse.json({ error: "this credit has already been used" }, { status: 409 });
  }
  if (credit.expires_at && new Date(credit.expires_at) < new Date()) {
    return NextResponse.json({ error: "this credit has expired" }, { status: 409 });
  }

  const { data: lesson } = await admin
    .from("group_lessons")
    .select("id, topic, scheduled_at, cancelled_at, max_students, group_lesson_registrations(student_id)")
    .eq("id", groupLessonId)
    .maybeSingle();

  if (!lesson || lesson.cancelled_at || new Date(lesson.scheduled_at) <= new Date()) {
    return NextResponse.json({ error: "that group class is no longer available" }, { status: 409 });
  }
  if (lesson.topic !== credit.topic) {
    return NextResponse.json({ error: "this credit can only be used for a matching group class" }, { status: 409 });
  }

  const registrations = (lesson.group_lesson_registrations as unknown as { student_id: string }[] | null) ?? [];
  if (registrations.some((r) => r.student_id === student.id)) {
    return NextResponse.json({ error: "you're already registered for that class" }, { status: 409 });
  }
  if (lesson.max_students !== null && registrations.length >= lesson.max_students) {
    return NextResponse.json({ error: "that class is full" }, { status: 409 });
  }

  const { error: regError } = await admin.from("group_lesson_registrations").insert({
    group_lesson_id: groupLessonId,
    student_id: student.id,
  });
  if (regError) {
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }

  const { error: creditError } = await admin
    .from("group_lesson_credits")
    .update({ used: true, used_group_lesson_id: groupLessonId })
    .eq("id", creditId);
  if (creditError) {
    return NextResponse.json(
      { error: `registered but credit update failed: ${creditError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
