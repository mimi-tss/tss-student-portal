import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePayrollRun, SALARY_REASON } from "@/lib/payroll/calculate";
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

  // The confirmation popup is the run's summary, so it shows what each
  // coach is owed for the whole period — including bonuses/deductions
  // added before this run (e.g. a fine entered mid-month), which the run
  // itself didn't insert. Same overlap filter as the Finalized list
  // (history route), so the two always agree.
  let entriesQuery = supabase
    .from("payroll_entries")
    .select("coach_id, amount, is_manual, reason, coaches(name)")
    .lt("period_start", periodEnd)
    .gt("period_end", periodStart);
  if (coachId) entriesQuery = entriesQuery.eq("coach_id", coachId);
  const periodEntries: {
    coach_id: string;
    amount: number;
    is_manual: boolean;
    reason: string | null;
    coaches: { name: string } | { name: string }[] | null;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await entriesQuery.range(offset, offset + 999);
    periodEntries.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const totals = new Map<string, { coachId: string; coachName: string; lines: number; adjustments: number; total: number }>();
  for (const e of periodEntries) {
    const coach = Array.isArray(e.coaches) ? e.coaches[0] : e.coaches;
    const t = totals.get(e.coach_id) ?? { coachId: e.coach_id, coachName: coach?.name ?? "Coach", lines: 0, adjustments: 0, total: 0 };
    t.lines += 1;
    if (e.is_manual && e.reason !== SALARY_REASON) t.adjustments = Math.round((t.adjustments + Number(e.amount)) * 100) / 100;
    t.total = Math.round((t.total + Number(e.amount)) * 100) / 100;
    totals.set(e.coach_id, t);
  }
  const periodTotals = Array.from(totals.values()).sort((a, b) => a.coachName.localeCompare(b.coachName));

  return NextResponse.json({ ...result, periodTotals });
}
