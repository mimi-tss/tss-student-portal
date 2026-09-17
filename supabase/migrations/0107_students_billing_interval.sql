-- Record-only billing cadence for a manually/ambassador-provisioned
-- student (app/(admin)/admin/dashboard/provision-student-client.tsx) —
-- these accounts never go through Stripe Checkout at all, so there was
-- previously no way to note whether admin considers someone "on an
-- annual plan" vs "monthly" for a comped/manual account. Purely
-- informational: nothing in code reads this to gate access or compute
-- billing_anniversary_date: — a real Stripe subscription's actual
-- interval lives on the Stripe Price itself, never mirrored here.
alter table students
  add column billing_interval text check (billing_interval in ('monthly', '3month', '6month', 'yearly'));
