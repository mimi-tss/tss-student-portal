-- Lets a coach's own dashboard flag "new payroll" until they've actually
-- looked — set server-side (service-role, from app/api/coach/payroll's
-- own route, never client-writable) whenever a finalized entry is
-- returned to that coach. No new RLS policy needed: the write only ever
-- happens from trusted server code that already resolved the requesting
-- coach's own id, the same posture as the webhook/magic-link routes
-- that already use the service-role client for a similar reason.
alter table payroll_entries add column coach_seen_at timestamptz;
