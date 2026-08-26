-- Persisted, manually-worked Needs Attention queue. Everything on this
-- queue requires a human to actually do something (spec: "everything
-- here admin has to manually handle") — so unlike the first pass, items
-- are real rows with a lifecycle (needs_action -> in_progress ->
-- resolved) and admin notes, not just a live re-computed list that
-- vanishes the moment its underlying condition changes.
--
-- Two creation patterns feed this table (see lib/admin/attention-items.ts):
--   - Event-driven kinds (coach_block_added, no_show_*, cancel_request,
--     upgraded_*, dnc) are inserted at the exact moment the triggering
--     action happens in code (coach_blocks insert, mark-attendance,
--     Kajabi sync, etc).
--   - Condition-driven kinds (credit_expiring, trial_unbooked,
--     no_recurring_schedule, hold_ending_soon, inactive_10_days) are
--     reconciled on read: syncComputedAttentionItems() creates one the
--     first time a condition is seen for a student and leaves it alone
--     after that (so resolving it sticks, even though the underlying
--     condition may still be true) — it never re-creates a duplicate for
--     the same still-open condition.
create table attention_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
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
    'inactive_10_days'
  )),
  student_id uuid references students (id),
  coach_id uuid references coaches (id),
  request_id uuid references student_requests (id),
  status text not null default 'needs_action' check (status in ('needs_action', 'in_progress', 'resolved')),
  summary text not null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles (id)
);

create index attention_items_status_idx on attention_items (status, created_at);
create index attention_items_student_kind_idx on attention_items (student_id, kind);

alter table attention_items enable row level security;

create policy "admins can manage attention items"
  on attention_items for all
  using (is_admin())
  with check (is_admin());
