import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findStripeCustomerAcrossAccounts } from "@/lib/stripe/accounts";
import type { StripeAccount } from "@/types/database";

export interface BillingStudent {
  studentId: string;
  email: string;
  name: string;
  stripeAccount: StripeAccount | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

// Resolves the logged-in billing-site student and, if they've never been
// linked to a Stripe account yet, does the lazy link-on-first-view: a
// pre-migration Opus customer visiting for the first time has no
// stripe_customer_id in our DB at all, so this looks them up by email —
// Opus first, then the current account — and persists the result. Every
// /api/billing/* route that needs "who is this and which Stripe account
// are they in" should go through this rather than re-deriving it.
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
    .select("id, email, name, stripe_customer_id, stripe_subscription_id, stripe_account")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) return null;

  if (student.stripe_customer_id && student.stripe_account) {
    return {
      studentId: student.id,
      email: student.email,
      name: student.name,
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
    stripeAccount: found.account,
    stripeCustomerId: found.customerId,
    stripeSubscriptionId: found.subscriptionId,
  };
}
