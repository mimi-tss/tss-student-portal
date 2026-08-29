import { occurrencesFor, WEEKS_AHEAD } from "@/lib/scheduling/recurring";
import { getHolidayDateKeys } from "@/lib/scheduling/holidays";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

export interface MaterializeCoachBlocksResult {
  created: number;
}

// Creates any missing future coach_blocks occurrences for active
// recurring_coach_blocks rules — same materialize-forward pattern as
// materializeRecurringSessions and materializeRecurringGroupLessons.
// coach_id null on a rule means "every currently-active coach";
// expanded fresh on every call so a newly added coach picks up e.g.
// Team Huddle on the next run without anyone adding it by hand.
// Idempotent per (rule, coach): an instant already materialized for
// that pair is skipped, same "taken" dedup as the other two.
export async function materializeRecurringCoachBlocks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { ruleId?: string } = {},
): Promise<MaterializeCoachBlocksResult> {
  let query = supabase
    .from("recurring_coach_blocks")
    .select("id, coach_id, day_of_week, start_time, duration_minutes, timezone, reason, start_date")
    .eq("active", true);

  if (opts.ruleId) query = query.eq("id", opts.ruleId);

  const { data: rules } = await query;
  if (!rules || rules.length === 0) return { created: 0 };

  const now = new Date();
  const holidayDates = await getHolidayDateKeys(supabase);
  const { data: activeCoaches } = await supabase.from("coaches").select("id").eq("active", true);
  const activeCoachIds: string[] = (activeCoaches ?? []).map((c: { id: string }) => c.id);

  let created = 0;

  for (const rule of rules) {
    const targetCoachIds = rule.coach_id ? [rule.coach_id] : activeCoachIds;
    const timeZone = rule.timezone || DEFAULT_TIMEZONE;
    // A blank start_date means "starts immediately" (now); a future one
    // pushes the first occurrence out, same effectiveFrom pattern
    // materializeRecurringSessions uses for recurring_schedules.start_date.
    const startDate = rule.start_date ? new Date(`${rule.start_date}T00:00:00Z`) : null;
    const effectiveFrom = startDate && startDate > now ? startDate : now;
    const instants = occurrencesFor(rule.day_of_week, rule.start_time, timeZone, effectiveFrom, WEEKS_AHEAD, null, holidayDates);
    if (instants.length === 0) continue;
    const horizonEnd = instants[instants.length - 1];

    for (const coachId of targetCoachIds) {
      const { data: existing } = await supabase
        .from("coach_blocks")
        .select("start_at")
        .eq("recurring_coach_block_id", rule.id)
        .eq("coach_id", coachId)
        .gte("start_at", now.toISOString())
        .lte("start_at", horizonEnd.toISOString());

      const taken = new Set((existing ?? []).map((r: { start_at: string }) => new Date(r.start_at).getTime()));

      const rows = instants
        .filter((i) => !taken.has(i.getTime()))
        .map((i) => ({
          coach_id: coachId,
          start_at: i.toISOString(),
          end_at: new Date(i.getTime() + rule.duration_minutes * 60000).toISOString(),
          reason: rule.reason,
          recurring_coach_block_id: rule.id,
        }));

      if (rows.length === 0) continue;
      const { error } = await supabase.from("coach_blocks").insert(rows);
      if (!error) {
        created += rows.length;
      } else {
        // One bad rule/coach pair shouldn't abort materializing every
        // other one in the same pass — logged, not thrown.
        console.error(
          `materializeRecurringCoachBlocks: insert failed for rule ${rule.id}, coach ${coachId}`,
          error.message,
        );
      }
    }
  }

  return { created };
}

// Stops future occurrences from being generated. Unlike group lesson
// series (which deliberately leave already-materialized future rows
// alone, since students have registered and are expecting to attend),
// a block has no one counting on it — it only ever removes
// availability — so leaving stale future blocks behind after the rule
// that created them is stopped would just waste coach time for no
// reason. Deletes future, not-yet-started coach_blocks rows tied to
// this rule; anything already in progress or past is left alone.
export async function deactivateRecurringCoachBlockRule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ruleId: string,
): Promise<void> {
  const { error: updateError } = await supabase
    .from("recurring_coach_blocks")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (updateError) throw new Error(updateError.message);

  const { error: deleteError } = await supabase
    .from("coach_blocks")
    .delete()
    .eq("recurring_coach_block_id", ruleId)
    .gte("start_at", new Date().toISOString());
  if (deleteError) throw new Error(deleteError.message);
}
