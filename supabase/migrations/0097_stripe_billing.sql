-- Stripe becomes the source of truth for tier/subscription_status/
-- payment_status/billing_anniversary_date going forward, for any student
-- with a stripe_customer_id set. Kajabi keeps kajabi_customer_id for
-- course-content-access grant/revoke only — confirmed no live
-- Kajabi-billed students exist today, so this is net-new plumbing, not a
-- migration of existing subscriptions.

alter table students
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column stripe_price_id text; -- last-seen price id, admin display/debugging only — tier itself stays the enum column

create index students_stripe_customer_id_idx on students (stripe_customer_id);

-- Idempotency for Stripe webhook deliveries — same shape/posture as
-- kajabi_events (0002): only ever touched by the webhook route using the
-- service-role client, so deny-all RLS (no policies) is correct here too.
create table stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table stripe_events enable row level security;

-- New Needs Review kind: the Kajabi course-access grant/revoke that
-- should follow a Stripe tier change failed — admin needs to fix content
-- access in Kajabi by hand. See lib/kajabi/sync.ts.
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
  'fifth_week_available',
  'group_lesson_understaffed',
  'kajabi_grant_failed'
));
