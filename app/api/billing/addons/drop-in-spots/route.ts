import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getOpenGroupLessons } from "@/lib/group-lessons";

// Backs the Drop-In add-on's own spot picker
// (app/billing/addons/addons-client.tsx) — every open group-lesson
// occurrence this student could actually buy into, same capacity/
// visibility posture as getRedeemableGroupLessons (lib/group-lesson-
// credits.ts), just not filtered to one topic.
export async function GET() {
  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const spots = await getOpenGroupLessons(admin, billingStudent.studentId);
  return NextResponse.json({ spots });
}
