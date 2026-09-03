import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { attachRecordingToGroupLesson } from "@/lib/admin/recording-matching";

// Group-lesson counterpart to app/api/admin/meet-recordings/match/route.ts
// — fans the shortcut+notify out to every registered student instead of
// one, via attachRecordingToGroupLesson.
export async function POST(req: NextRequest) {
  const { recordingId, groupLessonId } = await req.json();
  if (!recordingId || !groupLessonId) {
    return NextResponse.json({ error: "recordingId and groupLessonId are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const admin = createAdminClient();
  const result = await attachRecordingToGroupLesson(admin, recordingId, groupLessonId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, notified: result.notified, skipped: result.skipped });
}
