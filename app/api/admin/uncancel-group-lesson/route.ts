import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REINSTATED_REASON } from "@/lib/group-lesson-topic";

// Brings back a cancelled group class that hasn't happened yet — e.g.
// it was auto-cancelled for low sign-ups (group-lesson-understaffed) and
// students then asked to join. Clears cancelled_at and stamps
// cancel_reason with REINSTATED_REASON so the auto-cancel job won't
// cancel it again. Registrations were never removed by the cancel, so
// anyone already on the roster is still on it; admin registers the rest
// from the lesson card. Any group-lesson credits the cancel issued are
// left alone (reported back, so admin can remove one by hand if wanted).
// Admin-only via RLS on group_lessons, same as cancel-group-lesson.
export async function POST(req: NextRequest) {
  const { groupLessonId } = await req.json();
  if (!groupLessonId) return NextResponse.json({ error: "groupLessonId required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: lesson } = await supabase
    .from("group_lessons")
    .select("id, scheduled_at, duration_minutes, cancelled_at")
    .eq("id", groupLessonId)
    .maybeSingle();
  if (!lesson) return NextResponse.json({ error: "group lesson not found" }, { status: 404 });
  if (!lesson.cancelled_at) return NextResponse.json({ error: "this class isn't cancelled" }, { status: 409 });
  if (new Date(lesson.scheduled_at).getTime() + lesson.duration_minutes * 60_000 <= Date.now()) {
    return NextResponse.json({ error: "this class has already passed" }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("group_lessons")
    .update({ cancelled_at: null, cancel_reason: REINSTATED_REASON })
    .eq("id", groupLessonId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json({ error: "No group lesson was updated — check admin access." }, { status: 403 });
  }

  const { count: creditsFromCancel } = await supabase
    .from("group_lesson_credits")
    .select("id", { count: "exact", head: true })
    .eq("source_group_lesson_id", groupLessonId)
    .eq("used", false);

  return NextResponse.json({ success: true, creditsFromCancel: creditsFromCancel ?? 0 });
}
