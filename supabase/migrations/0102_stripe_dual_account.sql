-- The studio has TWO Stripe accounts for one business: a legacy account
-- ("opus") holding pre-migration customers, and the current account
-- ("own") that all new signups go through (see
-- app/api/webhooks/stripe/route.ts / lib/stripe/client.ts). Stripe IDs
-- are just opaque strings — this column is what says which account's
-- API client to use for a given student's stripe_customer_id/
-- stripe_subscription_id (added in 0097), rather than needing two
-- parallel ID columns.
alter table students
  add column stripe_account text check (stripe_account in ('opus', 'own'));
