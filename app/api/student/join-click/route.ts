import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Hit via navigator.sendBeacon from join-button.tsx — fire-and-forget,
// the response is never read by the caller. Validates the session/
// group lesson actually belongs to the caller before logging, so the
// resulting evidence can't be polluted with a bogus id. Existence of a
// row here is only ever "the student's own browser sent this request"
// — good but not cryptographic evidence they clicked; absence of a row
// is the stronger signal ("no record they ever attempted to join").
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let sessionId: unknown;
  let kind: unknown;
  try {
    const body = await req.json();
    sessionId = body.sessionId;
    kind = body.kind;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof sessionId !== "string" || (kind !== "session" && kind !== "group_lesson")) {
    return NextResponse.json({ error: "sessionId and a valid kind are required" }, { status: 400 });
  }

  const { data: student } = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "not your session" }, { status: 403 });
  }

  if (kind === "session") {
    const { data: session } = await supabase.from("sessions").select("id, student_id").eq("id", sessionId).maybeSingle();
    if (!session || session.student_id !== student.id) {
      return NextResponse.json({ error: "not your session" }, { status: 403 });
    }
  } else {
    const { data: registration } = await supabase
      .from("group_lesson_registrations")
      .select("id")
      .eq("group_lesson_id", sessionId)
      .eq("student_id", student.id)
      .maybeSingle();
    if (!registration) {
      return NextResponse.json({ error: "not your group lesson" }, { status: 403 });
    }
  }

  const { error } = await supabase.from("activity_events").insert({
    event_type: "join_click",
    actor_id: user.id,
    session_id: kind === "session" ? sessionId : null,
    group_lesson_id: kind === "group_lesson" ? sessionId : null,
  });
  if (error) console.error("join-click log failed", error);

  return NextResponse.json({ ok: true });
}
