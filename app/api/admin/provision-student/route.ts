import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { provisionStudent } from "@/lib/admin/provision-student";

// Manually provisions a student — for ambassadors given free access via
// Kajabi's "Grant Offer" or a 100%-off coupon (neither fires a purchase
// webhook, confirmed in TSS_App_Spec_1.md section 1), and for Coach
// Tara's students, who are billed via Stripe and never touch Kajabi at
// all (section 5/8). This is the direct-admin-action counterpart to what
// the webhook does automatically for a real Kajabi purchase.
// sessionDurationMinutes is the manual equivalent of Kajabi's 60-Minute
// Session Upgrade add-on, for Tara's students who won't ever purchase
// that Kajabi offer.
//
// The actual insert-student/create-auth-user/drive-folder/login-link
// sequence lives in lib/admin/provision-student.ts, shared with the CSV
// bulk-import route (app/api/admin/bulk-import-students/route.ts) — this
// handler is just the admin-auth check plus that one call.
export async function POST(req: NextRequest) {
  const {
    email,
    name,
    tier,
    coachId,
    sessionDurationMinutes,
    ambassador,
    lessonType,
    dayOfWeek,
    startTime,
    startDate,
    creditExpiresAt,
    birthDate,
    billingAnniversaryDate,
    studentSinceOverride,
    coachStartDateOverride,
    phone,
    gender,
    addressStreet,
    addressCity,
    addressState,
    addressZip,
    addressCountry,
    guardianName,
    guardianRelationship,
    guardianPhone,
    guardianEmail,
  } = await req.json();

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

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const result = await provisionStudent(admin, {
    email,
    name,
    tier,
    coachId,
    sessionDurationMinutes,
    ambassador,
    lessonType,
    dayOfWeek,
    startTime,
    startDate,
    creditExpiresAt,
    birthDate,
    billingAnniversaryDate,
    studentSinceOverride,
    coachStartDateOverride,
    phone,
    gender,
    addressStreet,
    addressCity,
    addressState,
    addressZip,
    addressCountry,
    guardianName,
    guardianRelationship,
    guardianPhone,
    guardianEmail,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, studentId: result.studentId });
}
