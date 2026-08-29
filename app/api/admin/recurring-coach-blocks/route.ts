import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { materializeRecurringCoachBlocks, deactivateRecurringCoachBlockRule } from "@/lib/coach-blocks";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Admin's recurring time-off rules (Team Huddle for every coach, a
// specific coach's own standing lunch/dinner break) — separate from
// app/api/admin/coach-blocks/route.ts (one-off blocks), same relation
// as app/api/admin/recurring-schedule/route.ts is to regular booking.
// Authorization is enforced by RLS ("admins can manage recurring coach
// blocks", migration 0063), not re-checked here — same posture as the
// sibling recurring-schedule/recurring-group-lesson routes.
export async function GET(req: NextRequest) {
  const coachId = req.nextUrl.searchParams.get("coachId");
  const supabase = await createClient();

  // Rules relevant to a given coach's own time-off panel: their own
  // rules plus any all-coaches one (coach_id null) — same visibility
  // the RLS policy itself grants a logged-in coach.
  let query = supabase
    .from("recurring_coach_blocks")
    .select("id, coach_id, day_of_week, start_time, duration_minutes, timezone, reason, start_date, coaches(name)")
    .eq("active", true)
    .order("day_of_week")
    .order("start_time");

  if (coachId) query = query.or(`coach_id.eq.${coachId},coach_id.is.null`);

  const { data } = await query;

  const rules = (data ?? []).map((r) => ({
    id: r.id,
    coachId: r.coach_id,
    coachName: (r.coaches as unknown as { name: string } | null)?.name ?? null,
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    durationMinutes: r.duration_minutes,
    timezone: r.timezone,
    reason: r.reason,
    startDate: r.start_date,
  }));

  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const { coachId, dayOfWeek, startTime, durationMinutes, timezone, reason, startDate } = await req.json();

  if (dayOfWeek === undefined || dayOfWeek === null || !startTime || !durationMinutes) {
    return NextResponse.json(
      { error: "dayOfWeek, startTime, and durationMinutes are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: rule, error } = await supabase
    .from("recurring_coach_blocks")
    .insert({
      // Absent/empty coachId means "every coach" — matches the
      // nullable column's own meaning, not left ambiguous between
      // undefined and an explicit "" from the form.
      coach_id: coachId || null,
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      duration_minutes: Number(durationMinutes),
      timezone: timezone || DEFAULT_TIMEZONE,
      reason: reason || null,
      // Blank means "starts immediately" — materializeRecurringCoachBlocks
      // treats null the same as a past/today date.
      start_date: startDate || null,
    })
    .select("id")
    .single();

  if (error || !rule) {
    return NextResponse.json({ error: error?.message ?? "couldn't create the rule" }, { status: 500 });
  }

  // Materializes immediately (same reason recurring-schedule's own
  // POST does) so the new block shows up on every affected coach's
  // calendar right away instead of waiting for tomorrow's cron.
  const result = await materializeRecurringCoachBlocks(supabase, { ruleId: rule.id });

  return NextResponse.json({ success: true, id: rule.id, ...result });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();

  try {
    await deactivateRecurringCoachBlockRule(supabase, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't stop the rule" },
      { status: 500 },
    );
  }
}
