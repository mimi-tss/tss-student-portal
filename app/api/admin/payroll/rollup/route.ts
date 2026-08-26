import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeAllCoachesPayroll } from "@/lib/payroll/calculate";
import { hasFinanceRole } from "@/lib/auth/roles";

// Live, on-the-fly rollup across every coach for an admin-chosen date
// range (TSS_App_Spec_1.md section 8: "payroll rollup"). RLS scopes
// `coaches`/`sessions`/`group_lessons` reads to is_admin(), which admits
// both "admin" and "admin_finance" — so this route needs its own
// explicit finance-role check, otherwise a plain "admin" hitting this
// URL directly would still get real payroll numbers despite the Finance
// page itself redirecting them away (requireFinanceAccess).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const periodStart = req.nextUrl.searchParams.get("start");
  const periodEnd = req.nextUrl.searchParams.get("end");

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const summaries = await computeAllCoachesPayroll(supabase, periodStart, periodEnd);
  return NextResponse.json({ summaries });
}
