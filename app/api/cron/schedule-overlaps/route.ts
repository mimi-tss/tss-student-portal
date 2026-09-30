import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { flagScheduleOverlaps } from "@/lib/admin/schedule-overlaps";
import { isCronAuthorized } from "@/lib/cron/auth";

// Raises a Needs Review item for every upcoming lesson that overlaps
// something else on the calendar (lib/admin/schedule-overlaps.ts).
// Hourly via .github/workflows/schedule-overlaps.yml; also runs inside
// the daily materialize-recurring cron and right after time off is added.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await flagScheduleOverlaps(createAdminClient());
  return NextResponse.json(result);
}
