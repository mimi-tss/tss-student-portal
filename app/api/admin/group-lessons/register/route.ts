import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerStudentInGroupLesson } from "@/lib/group-lessons";

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
