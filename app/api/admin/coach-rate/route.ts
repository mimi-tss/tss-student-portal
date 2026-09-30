import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// Edits coaches.hourly_rate — pay rate, so finance-only (not every
// "admin"), same boundary as the rest of the Finance page. Uses the
// "admins can update coaches" RLS policy (0041), same hardened
// zero-rows check as coach-active/route.ts so a still-missing migration
// fails loudly instead of silently no-op'ing.
//
// Also sets coaches.monthly_salary (migration 0121): pass monthlySalary
// as a non-negative number for fixed monthly pay, or null to go back to
// hourly. Either field can be sent on its own.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { coachId, hourlyRate, monthlySalary } = body;

  const hasRate = hourlyRate !== undefined;
  const hasSalary = "monthlySalary" in body;
  if (
    !coachId ||
    (!hasRate && !hasSalary) ||
    (hasRate && (typeof hourlyRate !== "number" || hourlyRate < 0)) ||
    (hasSalary && monthlySalary !== null && (typeof monthlySalary !== "number" || monthlySalary < 0))
  ) {
    return NextResponse.json(
      { error: "coachId plus a non-negative hourlyRate and/or monthlySalary (or null) are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { data: updated, error } = await supabase
    .from("coaches")
    .update({
      ...(hasRate ? { hourly_rate: hourlyRate } : {}),
      ...(hasSalary ? { monthly_salary: monthlySalary } : {}),
    })
    .eq("id", coachId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "No coach row was updated — check that migration 0041_admin_coach_updates.sql has been applied." },
      { status: 403 },
    );
  }

  return NextResponse.json({ success: true });
}
