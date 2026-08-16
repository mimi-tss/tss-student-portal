-- Additional-lesson offer paid via a standalone Stripe link, entirely
-- outside Kajabi (no product, no webhook, no sync) — spec section 5.
-- Admin confirms the Stripe payment manually, then grants a credit here.
-- Reuses the existing makeup_credits system (so it's redeemable through
-- the same booking flow as any other credit) rather than a parallel one,
-- but as a new type: uncapped and with an admin-chosen expiry, unlike
-- the self-service student-fault credits.

alter table makeup_credits drop constraint makeup_credits_type_check;
alter table makeup_credits add constraint makeup_credits_type_check
  check (type in ('student-fault', 'studio-planned', 'studio-emergency', 'purchased-addon'));

create policy "admins can add makeup credits"
  on makeup_credits for insert
  with check (is_admin());
