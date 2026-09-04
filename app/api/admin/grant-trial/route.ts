import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";

// Admin grants a one-time trial-lesson entitlement to an existing
// student — the after-the-fact counterpart to provisionStudent's own
// grant at creation time (lib/admin/provision-student.ts), for a
// student who doesn't already have one: a non-Suite manual add, a CSV
// import, a Kajabi-synced student, or simply forgotten when they were
// added. Uses the admin client for the actual insert since there's no
// admin INSERT policy on entitlements today (only select/update/delete
// — migration 0079) — same posture as provision-student's own route.
export async function POST(req: NextRequest) {
  const { studentId } = await req.json();
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

  const admin = createAdminClient();

  const { data: student } = await admin.from("students").select("id").eq("id", studentId).maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

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
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
