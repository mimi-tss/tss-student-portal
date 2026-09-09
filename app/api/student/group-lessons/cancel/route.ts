import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 24-hour notice rule, same threshold as the student's own 1:1 session
// self-cancel (app/api/booking/cancel/route.ts) — but distinct in every
// other way: a group-lesson credit never expires (unlike a 1:1 makeup
// credit's 30-day window) and doesn't count against the monthly/yearly
// makeup cap (it's a completely separate table, group_lesson_credits,
// never makeup_credits). Cancelling inside the window is a plain forfeit
// — no credit, same as a late 1:1 cancellation, just no cap bookkeeping
// needed since there's nothing to cap.
const NOTICE_HOURS = 24;

export async function POST(req: NextRequest) {
  const { registrationId } = await req.json();
  if (!registrationId) {
    return NextResponse.json({ error: "registrationId required" }, { status: 400 });
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

  const { data: registration } = await admin
    .from("group_lesson_registrations")
    .select("id, student_id, status, group_lessons(id, topic, scheduled_at, cancelled_at)")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration || registration.student_id !== student.id) {
    return NextResponse.json({ error: "registration not found" }, { status: 404 });
  }
  if (registration.status !== "registered") {
    return NextResponse.json({ error: "this class has already happened" }, { status: 409 });
  }

  const lesson = registration.group_lessons as unknown as
    | { id: string; topic: string | null; scheduled_at: string; cancelled_at: string | null }
    | { id: string; topic: string | null; scheduled_at: string; cancelled_at: string | null }[]
    | null;
  const groupLesson = Array.isArray(lesson) ? lesson[0] : lesson;

  if (!groupLesson || groupLesson.cancelled_at) {
    return NextResponse.json({ error: "this class is no longer scheduled" }, { status: 409 });
  }

  const hoursNotice = (new Date(groupLesson.scheduled_at).getTime() - Date.now()) / (60 * 60 * 1000);
  const withNotice = hoursNotice >= NOTICE_HOURS;

  const { error: deleteError } = await admin
    .from("group_lesson_registrations")
    .delete()
    .eq("id", registrationId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // No topic means no credit can ever be redeemed (topic is not-null on
  // group_lesson_credits and redemption matches by exact topic) — the
  // cancellation itself still goes through, just without a credit, same
  // as admin's own "needs a topic first" guard elsewhere.
  let creditGranted = false;
  if (withNotice && groupLesson.topic?.trim()) {
    const { error: creditError } = await admin.from("group_lesson_credits").insert({
      student_id: student.id,
      topic: groupLesson.topic,
      source_group_lesson_id: groupLesson.id,
      expires_at: null,
      reason: "student self-cancelled with 24+ hours notice",
    });
    if (creditError) {
      return NextResponse.json(
        { error: `cancelled, but issuing your credit failed: ${creditError.message}` },
        { status: 500 },
      );
    }
    creditGranted = true;
  }

  const message = creditGranted
    ? "Cancelled — you've earned a class credit (no expiration) for a future class with the same topic."
    : withNotice
      ? "Cancelled. This class has no topic set, so no credit could be issued — contact the studio."
      : "Cancelled. This was inside the 24-hour notice window, so no credit was issued.";

  return NextResponse.json({ success: true, creditGranted, message });
}
