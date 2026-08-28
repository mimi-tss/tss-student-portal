import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tags a student as an ambassador (students.ambassador) — purely cosmetic,
// swaps their dashboard plan label to "<Tier> (Ambassador)". RLS ("admins
// can update all students", 0007) enforces the admin-only check, same
// posture as set-referral/route.ts and set-birth-date/route.ts.
export async function POST(req: NextRequest) {
  const { studentId, ambassador } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ ambassador: !!ambassador })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
