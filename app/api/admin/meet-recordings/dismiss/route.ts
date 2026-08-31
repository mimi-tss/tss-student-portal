import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { dismissRecording } from "@/lib/admin/recording-matching";

// For a recording that isn't a student lesson at all (a coach's
// internal meeting, a personal call recorded in the same persistent
// room) — explicitly clears it from the queue without ever attaching
// it to a student, matching how the day-matching logic already refuses
// to guess when there's no clean 1:1 pairing.
export async function POST(req: NextRequest) {
  const { recordingId } = await req.json();
  if (!recordingId) return NextResponse.json({ error: "recordingId is required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const result = await dismissRecording(createAdminClient(), recordingId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
