import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-topic switches (migration 0119) — see app/billing/account/
// notification-preferences-client.tsx.
const PREF_KEYS = [
  "notify_reminders_email",
  "notify_reminders_sms",
  "notify_bookings_email",
  "notify_bookings_sms",
  "notify_credits_email",
  "notify_credits_sms",
  "notify_messages_email",
  "notify_recordings_email",
  "notify_digest_email",
] as const;

// Updates the caller's own notification preferences (per-topic email /
// text). Self-service only, same "resolve student_id from auth.getUser(), no id in the body"
// posture as /api/student/requests. `students` has no self-UPDATE RLS
// policy (admin-only writes — see lib/billing/student-stripe-link.ts's
// own comment on this), so the write below uses the admin client —
// ownership is already established above via the session-scoped lookup,
// same pattern as /api/billing/account-details.
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
  for (const key of PREF_KEYS) {
    if (typeof body[key] === "boolean") update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no valid preference fields provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("students").update(update).eq("id", student.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
