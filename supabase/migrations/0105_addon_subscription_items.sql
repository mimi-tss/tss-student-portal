-- Add-ons (e.g. Suite's biweekly lessons, Pro's 60-min lessons) are a
-- second Stripe subscription item on the student's existing subscription,
-- self-serve/instant like Change Plan (0103) — no admin approval, just a
-- student_requests row for the record + a Slack ping. addon_id is plain
-- text, not a check-constrained enum: the catalog itself lives in code
-- (lib/billing/addons.ts) and is validated there, so a new add-on never
-- needs a migration to be logged correctly here.
alter table student_requests
  drop constraint student_requests_type_check,
  add constraint student_requests_type_check
    check (type in ('cancel_subscription', 'pause_subscription', 'change_plan', 'addon_toggle')),
  add column addon_id text,
  add column addon_action text check (addon_action in ('add', 'remove'));
