import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin-granted group-lesson credit(s) — same posture as add-credit
// (session/makeup credits): a student who paid outside the self-serve
// flow (a standalone Stripe payment link, or a purchased pack like the
// 4-Pack Group Class add-on) gets these credits granted manually once
// admin confirms the payment. Each credit is redeemed later through the
// student's own self-serve panel (GroupLessonCreditPanel, matched by
// exact topic — lib/group-lesson-credits.ts's getRedeemableGroupLessons),
// same table/shape the understaffed-class cron and cancel-group-lesson
// already grant into. `quantity` (default 1) inserts that many identical
// rows in one call, same convention as add-credit, capped at 10 to catch
// a typo'd quantity — a 4-pack purchase is 4 separate calls with
// quantity 4 in one, not four separate requests.
//
// Session client, not the admin/service-role one: "admins can manage
// group lesson credits" (migration 0086) is a for-all using(is_admin())
// policy, so an authenticated admin's own session already has write
// access here — same pattern app/api/admin/group-lessons/register/route.ts
// already uses for this table's neighbor, group_lesson_registrations.
export async function POST(req: NextRequest) {
  const { studentId, topic, expiresAt, quantity } = await req.json();
  const creditCount = quantity === undefined ? 1 : Number(quantity);

  if (
    !studentId ||
    typeof topic !== "string" ||
    !topic.trim() ||
    !Number.isInteger(creditCount) ||
    creditCount < 1 ||
    creditCount > 10
  ) {
    return NextResponse.json({ error: "studentId, topic, and quantity (1-10) are required" }, { status: 400 });
  }

  const supabase = await createClient();

  const rows = Array.from({ length: creditCount }, () => ({
    student_id: studentId,
    topic: topic.trim(),
    expires_at: expiresAt || null,
  }));

  const { error } = await supabase.from("group_lesson_credits").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, granted: creditCount });
}
