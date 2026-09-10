-- Pause and change-plan become request-gated, same shape as the
-- existing self-service cancel flow (0034) — a student action alerts
-- admin rather than touching Stripe directly; admin resolving the
-- request is what actually executes it (see lib/admin/attention-items.ts).
alter table student_requests
  drop constraint student_requests_type_check,
  add constraint student_requests_type_check
    check (type in ('cancel_subscription', 'pause_subscription', 'change_plan')),
  add column requested_tier text check (requested_tier in ('lite', 'suite', 'pro', 'elite')),
  add column requested_interval text check (requested_interval in ('monthly', 'yearly'));

-- Two new Needs Review kinds, mirroring cancel_request.
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
  'kajabi_grant_failed',
  'pause_request',
  'change_plan_request'
));
