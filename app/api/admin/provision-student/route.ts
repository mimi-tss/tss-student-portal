import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueAndSendLoginLink } from "@/lib/auth/magic-link";

// Manually provisions a student — for ambassadors given free access via
// Kajabi's "Grant Offer" or a 100%-off coupon, neither of which fires a
// purchase webhook (confirmed in TSS_App_Spec_1.md section 1). This is
// the direct-admin-action counterpart to what the webhook does
// automatically for a real purchase.
//
// Uses the service-role client for the auth-user/profile creation steps
// (creating a Supabase auth user isn't something a regular session's RLS
// grants can do — it needs the service role, same as the webhook route)
// but only after confirming the caller is an admin via the normal
// session-scoped client first.
export async function POST(req: NextRequest) {
  const { email, name, tier, coachId } = await req.json();

  if (!email || !name || !tier) {
    return NextResponse.json({ error: "email, name, and tier required" }, { status: 400 });
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

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: student, error } = await admin
    .from("students")
    .insert({
      email,
      name,
      tier,
      assigned_coach_id: coachId || null,
      subscription_status: "active",
      payment_status: "ok",
    })
    .select("id")
    .single();

  if (error || !student) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!createErr && authUser.user) {
    await admin.from("profiles").insert({ id: authUser.user.id, role: "student" });
    await admin.from("students").update({ profile_id: authUser.user.id }).eq("id", student.id);
  }

  if (tier === "suite") {
    await admin.from("entitlements").insert({
      student_id: student.id,
      perk_type: "trial_lesson",
      recurrence: "one-time",
    });
  }

  await issueAndSendLoginLink(student.id, email);

  return NextResponse.json({ success: true });
}
