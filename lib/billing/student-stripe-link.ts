import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findStripeCustomerAcrossAccounts } from "@/lib/stripe/accounts";
import type { StripeAccount, Tier } from "@/types/database";

export interface BillingStudent {
  studentId: string;
  email: string;
  name: string;
  stripeAccount: StripeAccount | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  // Our own mirror, set directly from the Checkout Session's metadata at
  // signup (app/api/webhooks/stripe/route.ts's checkout.session.completed
  // handler) — independent of whatever the live Stripe Price/Subscription
  // metadata says. Callers that need "what tier is this student really
  // on" for something that can't tolerate a live-Stripe resolution gap
  // (e.g. add-on eligibility) should fall back to this when
  // resolveTier(subscription, price) comes back null, rather than
  // showing an empty/broken page — see lib/stripe/tiers.ts's own header
  // comment on why live resolution can fail even after the subscription-
  // metadata fallback.
  tier: Tier;
}

// Resolves the logged-in billing-site student and, if they've never been
// linked to a Stripe account yet (or were only PARTIALLY linked — see
// below), does the lazy link-on-first-view: a pre-migration Opus
// customer visiting for the first time has no stripe_customer_id in our
// DB at all, so this looks them up by email — Opus first, then the
// current account — and persists the result. Every /api/billing/* route
// that needs "who is this and which Stripe account are they in" should
// go through this rather than re-deriving it.
//
// Confirmed live: a real student had stripe_customer_id and
// stripe_account set but stripe_subscription_id null — the old check
// here (`customer_id && account`) treated that as "already linked" and
// never re-ran discovery, so every billing page that needs a
// subscription (add-ons, /billing/account) saw stripeSubscriptionId as
// null forever and rendered as if nothing was linked at all, with no
// self-healing path. Requiring all three now means a partial link like
// that keeps retrying the real lookup on every visit until it resolves,
// instead of getting stuck the moment any one field is set.
//
// `students` has no self-UPDATE RLS policy (only admin does — confirmed
// via supabase/migrations/0005_trial_lesson_and_coach_admin.sql /
// 0007_fix_rls_recursion.sql), so the persist step uses the service-role
// admin client, same privileged-but-scoped-write pattern already used by
// app/api/student/requests/route.ts for its own attention_items insert.
export async function resolveBillingStudent(): Promise<BillingStudent | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: student } = await supabase
    .from("students")
    .select("id, email, name, tier, stripe_customer_id, stripe_subscription_id, stripe_account")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) return null;

  if (student.stripe_customer_id && student.stripe_account && student.stripe_subscription_id) {
    return {
      studentId: student.id,
      email: student.email,
      name: student.name,
      tier: student.tier as Tier,
      stripeAccount: student.stripe_account as StripeAccount,
      stripeCustomerId: student.stripe_customer_id,
      stripeSubscriptionId: student.stripe_subscription_id,
    };
  }

  const found = await findStripeCustomerAcrossAccounts(student.email);
  if (!found) {
    return {
      studentId: student.id,
      email: student.email,
      name: student.name,
      tier: student.tier as Tier,
      stripeAccount: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
  }

  const admin = createAdminClient();
  await admin
    .from("students")
    .update({
      stripe_customer_id: found.customerId,
      stripe_subscription_id: found.subscriptionId,
      stripe_account: found.account,
    })
    .eq("id", student.id);

  return {
    studentId: student.id,
    email: student.email,
    name: student.name,
    tier: student.tier as Tier,
    stripeAccount: found.account,
    stripeCustomerId: found.customerId,
    stripeSubscriptionId: found.subscriptionId,
  };
}
