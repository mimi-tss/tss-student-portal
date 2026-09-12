import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";

// Every field here (all free text/optional except name) maps 1:1 to a
// `students` column — see supabase/migrations/0070_student_contact_and_
// guardian_info.sql for why gender/address/guardian are all free text
// rather than fixed sets (source data was too inconsistent). Guardian
// contact is admin-reference only, never a second login (the student's
// own `email` still is).
const CAMEL_TO_COLUMN: Record<string, string> = {
  phone: "phone",
  birthDate: "birth_date",
  gender: "gender",
  addressStreet: "address_street",
  addressCity: "address_city",
  addressState: "address_state",
  addressZip: "address_zip",
  addressCountry: "address_country",
  guardianName: "guardian_name",
  guardianRelationship: "guardian_relationship",
  guardianPhone: "guardian_phone",
  guardianEmail: "guardian_email",
};

// `students` has no self-UPDATE RLS policy (only admin does — see
// lib/billing/student-stripe-link.ts's own comment on this), so this
// re-derives the student from the session via resolveBillingStudent()
// and writes with the admin client — same ownership-checked
// privileged-write pattern as request-cancel/request-pause. Email is
// deliberately not accepted here: it's also the magic-link/OTP login
// identity, and changing it needs its own re-verification step.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name } = body;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const update: Record<string, string | null> = { name: name.trim() };
  for (const [camelKey, column] of Object.entries(CAMEL_TO_COLUMN)) {
    const value = body[camelKey];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") {
      return NextResponse.json({ error: `Invalid ${camelKey}.` }, { status: 400 });
    }
    update[column] = value ? value.trim() || null : null;
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.from("students").update(update).eq("id", billingStudent.studentId);

  if (error) {
    return NextResponse.json({ error: "Couldn't save your details." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
