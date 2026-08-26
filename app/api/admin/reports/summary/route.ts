import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";
import { computeReportsSummary } from "@/lib/admin/reports";

// Backs the Reports page's date-range + coach filters. Finance-only,
// same posture as the Finance tab's own payroll routes — RLS's
// is_admin() admits both "admin" and "admin_finance", so this needs its
// own explicit check.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const coachIdsParam = req.nextUrl.searchParams.get("coachIds");

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const coachIds = coachIdsParam ? coachIdsParam.split(",").filter(Boolean) : undefined;
  const summary = await computeReportsSummary(supabase, new Date(startParam), new Date(endParam), coachIds);
  return NextResponse.json(summary);
}
