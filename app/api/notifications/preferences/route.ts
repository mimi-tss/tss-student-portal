import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Updates the caller's own notification-channel preferences — 2 groups
// (digest, alerts) x 3 channels (email, sms, in-app) each. Self-service
// only, same "resolve student_id from auth.getUser(), no id in the body"
// posture as /api/student/requests.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const { data: student } = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  const body = await req.json();
  const update: Record<string, boolean> = {};
  for (const group of ["digest", "alerts"] as const) {
    for (const channel of ["email", "sms", "inapp"] as const) {
      const key = `notify_${group}_${channel}`;
      if (typeof body[key] === "boolean") update[key] = body[key];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no valid preference fields provided" }, { status: 400 });
  }

  const { error } = await supabase.from("students").update(update).eq("id", student.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
