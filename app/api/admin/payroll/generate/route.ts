import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePayrollRun } from "@/lib/payroll/calculate";
import { hasFinanceRole } from "@/lib/auth/roles";

// Freezes the live rollup into real payroll_entries rows for a period —
// the "generate run" step in admin payroll (TSS_App_Spec_1.md section 8).
// Idempotent via payroll_entries' unique(session_id)/unique(group_lesson_id)
// constraints (migration 0023/0032) — re-running the same range never
// duplicates a row.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { periodStart, periodEnd, coachId } = await req.json();

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "periodStart and periodEnd required" }, { status: 400 });
  }

  const result = await generatePayrollRun(supabase, periodStart, periodEnd, coachId || undefined);
  return NextResponse.json(result);
}
