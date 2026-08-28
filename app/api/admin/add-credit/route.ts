import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_DURATIONS = [30, 60];

// Admin-granted session credit(s) for a student who bought an extra lesson
// (or a 4-pack of them) via a standalone Stripe payment link — outside
// Kajabi entirely, no webhook, so this is the manual confirmation step
// after the admin sees the payment come through (spec section 5). Uncapped,
// expiry is whatever the admin sets, unlike self-service student-fault
// credits. Duration is picked explicitly (30 or 60 min) rather than assumed
// from the student's own plan — a 60-min add-on should book 60 min
// regardless of whether the student's regular sessions are 30.
// `quantity` (default 1) inserts that many identical rows in one call —
// each credit stays individually redeemable/trackable, same as if granted
// one at a time, capped at 10 to catch a typo'd quantity.
export async function POST(req: NextRequest) {
  const { studentId, expiresAt, durationMinutes, quantity } = await req.json();
  const creditCount = quantity === undefined ? 1 : Number(quantity);

  if (
    !studentId ||
    !expiresAt ||
    !VALID_DURATIONS.includes(durationMinutes) ||
    !Number.isInteger(creditCount) ||
    creditCount < 1 ||
    creditCount > 10
  ) {
    return NextResponse.json(
      {
        error:
          "studentId, expiresAt, durationMinutes (30 or 60), and quantity (1-10) are required",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const rows = Array.from({ length: creditCount }, () => ({
    student_id: studentId,
    type: "purchased-addon" as const,
    expires_at: expiresAt,
    duration_minutes: durationMinutes,
  }));

  const { error } = await supabase.from("makeup_credits").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, granted: creditCount });
}
