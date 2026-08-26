import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Soft-cancel (see migration 0043_group_lesson_cancel.sql) — never a
// delete. Group-lesson payment is already manual/informal (no live
// Stripe integration, just a stripe_reference note admin fills in), so
// refunding a cancelled lesson's paid attendees is handled the same
// way: directly with the student, outside the app, not automated here.
export async function POST(req: NextRequest) {
  const { groupLessonId, reason } = await req.json();

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
    .select("id, cancelled_at")
    .eq("id", groupLessonId)
    .maybeSingle();

  if (!lesson) return NextResponse.json({ error: "group lesson not found" }, { status: 404 });
  if (lesson.cancelled_at) return NextResponse.json({ error: "already cancelled" }, { status: 409 });

  const { data: updated, error } = await supabase
    .from("group_lessons")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", groupLessonId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "No group lesson was updated — check admin RLS on group_lessons." }, { status: 403 });
  }

  // admin_overrides is per-student (required student_id) and a group
  // lesson has many attendees, not one — doesn't fit that table. The
  // reason is still required above so cancelling isn't a no-explanation
  // click, it just isn't persisted anywhere beyond this request today.
  return NextResponse.json({ success: true });
}
