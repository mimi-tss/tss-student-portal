import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCoach } from "@/lib/notifications/create";

// Coach-facing Slack ping for "a student uploaded a file to their shared
// folder" — deliberately only when the STUDENT themselves is the
// uploader, never when their coach or admin uploads on their behalf
// (this same SharedFolderPanel component is reused on all three of
// their views). Whether the caller actually IS that student is resolved
// server-side (profile_id match), never trusted from the client — a
// no-op, not an error, when it isn't, since the upload itself already
// succeeded by the time this is called and shouldn't look like it failed.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { studentId, fileId, fileName } = await req.json();
  if (!studentId || !fileId || !fileName) {
    return NextResponse.json({ error: "studentId, fileId, and fileName required" }, { status: 400 });
  }

  const { data: student } = await supabase
    .from("students")
    .select("profile_id, name, assigned_coach_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student || student.profile_id !== user.id || !student.assigned_coach_id) {
    return NextResponse.json({ ok: true }); // not a student-initiated upload — nothing to notify
  }

  const admin = createAdminClient();
  const { data: coach } = await admin
    .from("coaches")
    .select("slack_webhook_url")
    .eq("id", student.assigned_coach_id)
    .maybeSingle();

  await notifyCoach(admin, {
    coachId: student.assigned_coach_id,
    coachSlackWebhookUrl: coach?.slack_webhook_url ?? null,
    kind: "file_uploaded",
    dedupKey: `coach:${student.assigned_coach_id}:file_uploaded:${fileId}`,
    text: `${student.name} uploaded a file: ${fileName}`,
  });

  return NextResponse.json({ ok: true });
}
