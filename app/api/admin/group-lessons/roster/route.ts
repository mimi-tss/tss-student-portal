import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRecurringSeriesRoster } from "@/lib/group-lessons";

// Who's registered across a recurring series' future occurrences,
// collapsed to one row per student — the roster view for the Recurring
// Series list, separate from each individual occurrence's own attendee
// list under Upcoming Group Lessons.
export async function GET(req: NextRequest) {
  const seriesId = req.nextUrl.searchParams.get("seriesId");

  if (!seriesId) {
    return NextResponse.json({ error: "seriesId required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const roster = await getRecurringSeriesRoster(supabase, seriesId);
    return NextResponse.json({ roster });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't load roster" },
      { status: 500 },
    );
  }
}
