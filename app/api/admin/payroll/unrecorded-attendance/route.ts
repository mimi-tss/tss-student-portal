import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findUnrecordedAttendance } from "@/lib/payroll/calculate";
import { hasFinanceRole } from "@/lib/auth/roles";

// Backs the Finance page's pre-payroll attendance check.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const periodStart = req.nextUrl.searchParams.get("start");
  const periodEnd = req.nextUrl.searchParams.get("end");
  const coachId = req.nextUrl.searchParams.get("coachId") || undefined;

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const coaches = await findUnrecordedAttendance(supabase, periodStart, periodEnd, coachId);
  return NextResponse.json({ coaches });
}
