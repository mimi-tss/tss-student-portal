import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { attachRecordingToStudent } from "@/lib/admin/recording-matching";

export async function POST(req: NextRequest) {
  const { recordingId, sessionId } = await req.json();
  if (!recordingId || !sessionId) {
    return NextResponse.json({ error: "recordingId and sessionId are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("student_id").eq("id", sessionId).single();
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const result = await attachRecordingToStudent(admin, recordingId, session.student_id, { sessionId, method: "manual" });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
