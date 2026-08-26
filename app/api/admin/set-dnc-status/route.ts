import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DNC flag management (TSS_App_Spec_1.md section 8). RLS ("admins can
// update all students", migration 0007) enforces the admin-only check —
// students.payment_status already existed for this since migration 0001,
// just had no write path.
const ALLOWED_STATUSES = ["ok", "dnc"] as const;

export async function POST(req: NextRequest) {
  const { studentId, status } = await req.json();

  if (!studentId || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ payment_status: status })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
