import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeCoachMetrics } from "@/lib/admin/coach-metrics";

// Powers the metrics boxes below the Coaches page calendar — attended /
// no-show counts, how many of the students seen in this window are
// payment-flagged DNC, and schedule utilization. Scoped to whatever
// coach(es) and date range the page currently has in view (all coaches
// for a day, one coach for a week, an arbitrary multi-coach selection,
// etc.) rather than a fixed period, so it tracks the calendar above it
// exactly. The actual calc lives in lib/admin/coach-metrics.ts so the
// Reports page (a server component) can call it directly too.
export async function GET(req: NextRequest) {
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const coachIdsParam = req.nextUrl.searchParams.get("coachIds");
  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }

  const supabase = await createClient();
  const requestedIds = coachIdsParam ? coachIdsParam.split(",").filter(Boolean) : [];

  const metrics = await computeCoachMetrics(
    supabase,
    new Date(startParam),
    new Date(endParam),
    requestedIds.length > 0 ? requestedIds : undefined,
  );

  return NextResponse.json(metrics);
}
