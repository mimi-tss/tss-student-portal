import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin counterpart to app/api/coach/mark-group-attendance — that route's
// RLS ("coaches can mark attendance on their own group lesson
// registrations", migration 0031) scopes a coach to their own lessons,
// so it can't fix another coach's mismark, and it doesn't allow
// "registered" at all (no self-service undo there). Admin relies on the
// separate "admins can manage group lesson registrations" policy
// (also 0031), which already covers every status including reverting
// a wrong mark back to registered.
const ALLOWED_STATUSES = ["registered", "attended", "no-show"] as const;

export async function POST(req: NextRequest) {
  const { registrationId, status } = await req.json();

  if (!registrationId || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_lesson_registrations")
    .update({ status })
    .eq("id", registrationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "registration not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
