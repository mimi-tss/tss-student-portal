import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin-granted session credit for a student who bought an extra lesson
// via a standalone Stripe payment link — outside Kajabi entirely, no
// webhook, so this is the manual confirmation step after the admin sees
// the payment come through (spec section 5). Uncapped, expiry is
// whatever the admin sets, unlike self-service student-fault credits.
export async function POST(req: NextRequest) {
  const { studentId, expiresAt } = await req.json();

  if (!studentId || !expiresAt) {
    return NextResponse.json(
      { error: "studentId and expiresAt required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.from("makeup_credits").insert({
    student_id: studentId,
    type: "purchased-addon",
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
