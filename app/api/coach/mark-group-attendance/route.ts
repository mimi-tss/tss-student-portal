import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Per-attendee attendance marking for a group lesson — same posture as
// app/api/coach/mark-attendance: RLS ("coaches can mark attendance on
// their own group lesson registrations", migration 0031) scopes this to
// the coach's own group lessons, not re-checked here.
const ALLOWED_STATUSES = ["attended", "no-show"] as const;

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
