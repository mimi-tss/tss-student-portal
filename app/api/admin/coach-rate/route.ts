import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// Edits coaches.hourly_rate — pay rate, so finance-only (not every
// "admin"), same boundary as the rest of the Finance page. Uses the
// "admins can update coaches" RLS policy (0041), same hardened
// zero-rows check as coach-active/route.ts so a still-missing migration
// fails loudly instead of silently no-op'ing.
export async function POST(req: NextRequest) {
  const { coachId, hourlyRate } = await req.json();

  if (!coachId || typeof hourlyRate !== "number" || hourlyRate < 0) {
    return NextResponse.json({ error: "coachId and a non-negative hourlyRate are required" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { data: updated, error } = await supabase
    .from("coaches")
    .update({ hourly_rate: hourlyRate })
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
