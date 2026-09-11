import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";

// `students` has no self-UPDATE RLS policy (only admin does — see
// lib/billing/student-stripe-link.ts's own comment on this), so this
// re-derives the student from the session via resolveBillingStudent()
// and writes with the admin client — same ownership-checked
// privileged-write pattern as request-cancel/request-pause. Email is
// deliberately not accepted here: it's also the magic-link/OTP login
// identity, and changing it needs its own re-verification step.
export async function POST(req: NextRequest) {
  const { name, phone } = await req.json();

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (phone !== null && typeof phone !== "string") {
    return NextResponse.json({ error: "Invalid phone." }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("students")
    .update({ name: name.trim(), phone: phone ? phone.trim() || null : null })
    .eq("id", billingStudent.studentId);

  if (error) {
    return NextResponse.json({ error: "Couldn't save your details." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
