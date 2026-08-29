-- Recurring time-off rules: a standing weekly block (Team Huddle for
-- every coach, a specific coach's own lunch/dinner break) that
-- materializes forward into real coach_blocks rows the same way
-- recurring_schedules -> sessions and recurring_group_lessons ->
-- group_lessons already do (see materializeRecurringCoachBlocks in
-- lib/coach-blocks.ts). That reuse is the whole point: every existing
-- coach_blocks consumer (booking slot generation, coach/admin
-- calendars, the dashboard's upcoming-blocks list, coach utilization
-- metrics) already reads coach_blocks correctly, so none of them need
-- to change to respect a recurring block.
--
-- coach_id nullable = "every currently-active coach", re-expanded on
-- every materialize run so a newly added coach picks up e.g. Team
-- Huddle automatically without anyone remembering to add it by hand.
--
-- timezone is explicit rather than derived, because the two use cases
-- genuinely differ: a specific coach's own lunch break is wall-clock
-- in THEIR zone (like their working_hours/recurring_schedules already
-- are), but an all-coaches meeting like "10:30am ET" is one fixed
-- absolute time the whole team shares — a coach in a different zone
-- sees it at a different local hour, which is correct, not a bug.
create table recurring_coach_blocks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches (id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time text not null,
  duration_minutes integer not null,
  timezone text not null,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Links a materialized coach_blocks row back to the rule that created
-- it — needed to skip re-materializing an instance that already
-- exists (idempotent, same "taken" dedup pattern as sessions/
-- group_lessons) and to clean up an outdated rule's future,
-- not-yet-started blocks when it's stopped.
alter table coach_blocks add column recurring_coach_block_id uuid references recurring_coach_blocks (id);

create index recurring_coach_blocks_coach_idx on recurring_coach_blocks (coach_id);
create index coach_blocks_recurring_idx on coach_blocks (recurring_coach_block_id);

alter table recurring_coach_blocks enable row level security;

create policy "admins can manage recurring coach blocks"
  on recurring_coach_blocks for all
  using (is_admin())
  with check (is_admin());

-- A coach can see their own rules and any all-coaches one (coach_id
-- null), same visibility as the one-time blocks they can already see
-- (migration 0009).
create policy "coaches can view their own or team-wide recurring blocks"
  on recurring_coach_blocks for select
  using (coach_id = auth_coach_id() or coach_id is null);
