-- One-time add-ons (lib/billing/addons.ts, kind: "one_time" — 4-Pack,
-- single lesson, Drop-In, Spotlight) log a "purchase" action alongside
-- the existing recurring add-ons' "add"/"remove" (0105) — a straight
-- off-session charge, not a subscription-item toggle.
alter table student_requests
  drop constraint student_requests_addon_action_check,
  add constraint student_requests_addon_action_check
    check (addon_action in ('add', 'remove', 'purchase'));
