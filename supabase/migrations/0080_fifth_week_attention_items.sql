-- New Needs Review kind: a weekly-cadence Pro/Elite student's current
-- billing cycle contains a "5th week" of their own day/time that
-- occurrencesFor() (lib/scheduling/recurring.ts) deliberately never
-- schedules or bills (spec section 4, CYCLE_SESSION_CAP) — a real,
-- sellable one-off lesson opportunity at the student's own regular
-- slot, not a gap to just leave empty. Surfaced so admin/coach can ask
-- the student if they want to buy it, with an "Add lesson" action that
-- books it directly at that exact date/time once they say yes.
--
-- Doesn't fit the (student_id, kind) dedup pattern from 0062 — like
-- recording_missing (0078), this needs to recur per occurrence: a
-- student's 5-week opportunity this cycle, and again whenever their
-- billing cycle happens to land on 5 weeks again months from now, are
-- two separate things to offer, not the same one forever-deduped item.
-- occurrence_at (the exact instant, not just a date) doubles as what
-- the action button needs to actually book the session — no separate
-- lookup required.
alter table attention_items add column occurrence_at timestamptz;

alter table attention_items drop constraint attention_items_kind_check;
alter table attention_items add constraint attention_items_kind_check check (kind in (
  'dnc',
  'cancel_request',
  'trial_unbooked',
  'credit_expiring',
  'upgraded_suite',
  'upgraded_pro',
  'upgraded_elite',
  'coach_block_added',
  'no_show_1',
  'no_show_2',
  'no_show_3',
  'no_recurring_schedule',
  'hold_ending_soon',
  'inactive_10_days',
  'recording_unmatched',
  'recording_missing',
  'fifth_week_available'
));

create unique index attention_items_fifth_week_uidx
  on attention_items (student_id, kind, occurrence_at)
  where student_id is not null and kind = 'fifth_week_available';
