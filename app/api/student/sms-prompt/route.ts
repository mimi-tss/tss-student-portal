import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ✕ on the dashboard "Get text reminders" card — hides it for good.
// Same self-service posture as /api/notifications/preferences: the
// student is resolved from the session, and the write uses the admin
// client because `students` has no self-UPDATE RLS policy.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const { data: student } = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (!student) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const { error } = await createAdminClient()
    .from("students")
    .update({ sms_prompt_dismissed_at: new Date().toISOString() })
    .eq("id", student.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
