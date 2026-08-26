import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// A manual bonus (positive amount) or deduction (negative amount) for a
// coach — not derived from any session or group lesson, so unlike the
// rest of payroll it skips the live-rollup/generate-run step entirely
// and lands directly in Finalized entries as its own payroll_entries
// row (paid: false, same mark-paid flow as everything else there).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { coachId, amount, reason, periodStart, periodEnd } = await req.json();

  if (!coachId || typeof amount !== "number" || amount === 0 || !reason?.trim() || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "coachId, a non-zero amount, reason, periodStart, and periodEnd are required" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("payroll_entries").insert({
    coach_id: coachId,
    amount,
    reason: reason.trim(),
    period_start: periodStart,
    period_end: periodEnd,
    is_manual: true,
    paid: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
