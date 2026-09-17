import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";

// Grants a trial-lesson entitlement to an EXISTING student — until now,
// the only way to grant one at all was the "Add ambassador / manual
// student" form's own checkbox, at creation time only. A real gap for
// any student who arrives without one already set (every real Stripe/
// webhook signup, which has no trial checkbox anywhere in that flow) —
// confirmed live there was no way to retroactively grant one. Mirrors
// provisionStudent's own insert (lib/admin/provision-student.ts).
// Relies on "admins can manage entitlements" RLS.
export async function POST(req: NextRequest) {
  const { studentId, coachId } = await req.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  // entitlements has no INSERT policy for any role, admin included —
  // provisionStudent's own insert (lib/admin/provision-student.ts) has
  // always gone through the service-role client for exactly this
  // reason. The session-scoped `supabase` client above is only used for
  // the auth/role check.
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("entitlements")
    .select("id")
    .eq("student_id", studentId)
    .eq("perk_type", "trial_lesson")
    .eq("used", false)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "This student already has an unused trial lesson." }, { status: 409 });
  }

  const { error } = await admin.from("entitlements").insert({
    student_id: studentId,
    perk_type: "trial_lesson",
    recurrence: "one-time",
    coach_id: coachId || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
