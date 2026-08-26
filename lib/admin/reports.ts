import type { createClient } from "@/lib/supabase/server";
import { computeCoachMetrics } from "@/lib/admin/coach-metrics";
import { computeCoachPayroll } from "@/lib/payroll/calculate";
import { TIER_PRICE_MONTHLY, tierMonthlyPrice } from "@/lib/billing/tier-pricing";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const TIER_ORDER = ["lite", "suite", "pro", "elite"] as const;

export interface ReportsCoachRow {
  id: string;
  name: string;
  students: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
}

export interface ReportsSummary {
  activeStudents: number;
  tierBreakdown: { lite: number; suite: number; pro: number; elite: number };
  dncCount: number;
  mrr: number;
  revenueByTier: { tier: string; revenue: number }[];
  utilizationPct: number;
  unpaidPayrollTotal: number;
  coachRows: ReportsCoachRow[];
  tableRevenueTotal: number;
  tableCostTotal: number;
  tableMarginTotal: number;
  tableMarginPct: number;
  unassignedRevenue: number;
  unbookedTrials: number;
}

// Everything the Reports page shows, scoped to a date range and an
// optional coach subset (undefined/empty = every active coach) — one
// function so the API route stays a thin wrapper and the whole page
// re-scopes consistently together, the same way the Coaches page's own
// metrics box re-scopes to whichever coach(es)/range are on screen.
//
// Roster-snapshot numbers (active students, tier mix, MRR, DNC, revenue
// by tier) are inherently "right now" — there's no historical tracking
// yet to answer "MRR as of last March" (see Cohort Retention's "Needs
// setup" note), so the date range only moves the numbers that actually
// are period-based: coach utilization, payroll cost, margin, and
// outstanding unpaid payroll.
export async function computeReportsSummary(
  supabase: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
  coachIds: string[] | undefined,
): Promise<ReportsSummary> {
  const scoped = coachIds !== undefined && coachIds.length > 0;
  const coachIdSet = scoped ? new Set(coachIds) : null;
  const inScope = (id: string | null) => !coachIdSet || (id !== null && coachIdSet.has(id));

  let coachQuery = supabase.from("coaches").select("id, name").eq("active", true).order("name");
  if (scoped) coachQuery = coachQuery.in("id", coachIds!);

  const [{ data: coaches }, { data: activeStudentsAll }, coachUtilization, { data: unpaidEntriesAll }, { count: unbookedTrialsCount }] =
    await Promise.all([
      coachQuery,
      supabase.from("students").select("assigned_coach_id, tier, payment_status").eq("subscription_status", "active"),
      computeCoachMetrics(supabase, rangeStart, rangeEnd, scoped ? coachIds : undefined),
      supabase
        .from("payroll_entries")
        .select("amount, coach_id")
        .eq("paid", false)
        .lte("period_start", rangeEnd.toISOString())
        .gte("period_end", rangeStart.toISOString()),
      supabase.from("entitlements").select("id", { count: "exact", head: true }).eq("perk_type", "trial_lesson").eq("used", false),
    ]);

  const scopedStudents = (activeStudentsAll ?? []).filter((s) => inScope(s.assigned_coach_id));

  const tierBreakdown = { lite: 0, suite: 0, pro: 0, elite: 0 };
  let dncCount = 0;
  for (const s of scopedStudents) {
    if (s.tier in tierBreakdown) tierBreakdown[s.tier as keyof typeof tierBreakdown]++;
    if (s.payment_status === "dnc") dncCount++;
  }
  const mrr = TIER_ORDER.reduce((sum, t) => sum + tierBreakdown[t] * TIER_PRICE_MONTHLY[t], 0);
  const revenueByTier = TIER_ORDER.map((t) => ({ tier: t, revenue: tierBreakdown[t] * TIER_PRICE_MONTHLY[t] }));

  const revenueByCoachId = new Map<string, number>();
  const studentCountByCoachId = new Map<string, number>();
  let unassignedRevenue = 0;
  for (const s of scopedStudents) {
    const price = tierMonthlyPrice(s.tier);
    if (s.assigned_coach_id) {
      revenueByCoachId.set(s.assigned_coach_id, (revenueByCoachId.get(s.assigned_coach_id) ?? 0) + price);
      studentCountByCoachId.set(s.assigned_coach_id, (studentCountByCoachId.get(s.assigned_coach_id) ?? 0) + 1);
    } else {
      unassignedRevenue += price;
    }
  }

  const payrollByCoach = await Promise.all(
    (coaches ?? []).map((c) => computeCoachPayroll(supabase, c.id, rangeStart.toISOString(), rangeEnd.toISOString())),
  );

  const coachRows: ReportsCoachRow[] = (coaches ?? []).map((c, i) => {
    const revenue = revenueByCoachId.get(c.id) ?? 0;
    const cost = payrollByCoach[i]?.total ?? 0;
    const margin = revenue - cost;
    return {
      id: c.id,
      name: c.name,
      students: studentCountByCoachId.get(c.id) ?? 0,
      revenue,
      cost,
      margin,
      marginPct: revenue > 0 ? Math.round((margin / revenue) * 100) : cost > 0 ? -100 : 0,
    };
  });
  const tableRevenueTotal = coachRows.reduce((s, r) => s + r.revenue, 0);
  const tableCostTotal = coachRows.reduce((s, r) => s + r.cost, 0);
  const tableMarginTotal = tableRevenueTotal - tableCostTotal;
  const tableMarginPct = tableRevenueTotal > 0 ? Math.round((tableMarginTotal / tableRevenueTotal) * 100) : 0;

  const unpaidPayrollTotal = (unpaidEntriesAll ?? [])
    .filter((e) => inScope(e.coach_id))
    .reduce((s, e) => s + e.amount, 0);

  return {
    activeStudents: scopedStudents.length,
    tierBreakdown,
    dncCount,
    mrr,
    revenueByTier,
    utilizationPct: coachUtilization.utilizationPct,
    unpaidPayrollTotal,
    coachRows,
    tableRevenueTotal,
    tableCostTotal,
    tableMarginTotal,
    tableMarginPct,
    // "Unassigned students" only makes sense as its own line when
    // looking at everyone — once specific coaches are selected, a
    // student with no coach at all was never going to be in that
    // selection, so folding it in would just be confusing, not useful.
    unassignedRevenue: scoped ? 0 : unassignedRevenue,
    unbookedTrials: unbookedTrialsCount ?? 0,
  };
}
