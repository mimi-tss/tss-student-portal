import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, stripeOpus } from "@/lib/stripe/client";
import { TIER_BY_STRIPE_PRICE_ID } from "@/lib/stripe/tiers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAttentionItem, type AttentionKind } from "@/lib/admin/attention-items";
import { syncKajabiForTierChange } from "@/lib/kajabi/sync";
import { issueAndSendBillingWelcomeLink } from "@/lib/auth/billing-welcome-link";
import { notifyStaff } from "@/lib/notifications/create";
import type { StripeAccount, Tier } from "@/types/database";

// Stripe's SDK needs Node's crypto for signature verification — the
// default Edge runtime doesn't have it.
export const runtime = "nodejs";

// Stripe is the sole source of truth for tier/subscription_status/
// payment_status/billing_anniversary_date on any student with
// stripe_customer_id set (see supabase/migrations/0097_stripe_billing.sql
// and PROGRESS.md). Real HMAC signature verification — unlike Kajabi's
// unsigned `?secret=` workaround (app/api/webhooks/kajabi/route.ts),
// Stripe actually signs its webhook deliveries.
//
// One route, two Stripe accounts ("own" = current, "opus" = the
// studio's legacy account — supabase/migrations/0102_stripe_dual_account.sql).
// Both accounts' webhooks are configured to POST here; each has its own
// signing secret, so verification tries "own" first, then Opus, and
// whichever succeeds tells every handler below which account's API
// client to use for any follow-up call and which stripe_account to
// stamp on a write.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  let account: StripeAccount;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    account = "own";
  } catch {
    try {
      event = stripeOpus.webhooks.constructEvent(rawBody, signature, process.env.OPUS_STRIPE_WEBHOOK_SECRET!);
      account = "opus";
    } catch (err) {
      console.error("Stripe webhook signature verification failed against both accounts", err);
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
  }

  const admin = createAdminClient();

  // Idempotency: Stripe retries on timeout/non-2xx, same posture as
  // kajabi_events — a caught duplicate-insert error means skip, not fail.
  const { error: dupeError } = await admin
    .from("stripe_events")
    .insert({ stripe_event_id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });

  if (dupeError) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      // New signups only ever happen on the current account — see
      // lib/stripe/accounts.ts's own header comment. An Opus-signed
      // checkout event shouldn't exist; skip rather than mis-stamp it.
      if (account !== "own") {
        console.error("checkout.session.completed signed by unexpected account", account);
        break;
      }
      await handleCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription, account);
      break;
    }

    case "customer.subscription.deleted": {
      await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription, account);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        await admin
          .from("students")
          .update({ payment_status: "dnc" })
          .eq("stripe_customer_id", customerId)
          .eq("stripe_account", account);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        await admin
          .from("students")
          .update({ payment_status: "ok" })
          .eq("stripe_customer_id", customerId)
          .eq("stripe_account", account);
      }
      break;
    }

    default:
      break;
  }

  await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("stripe_event_id", event.id);

  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

// One-time fulfillment for a new signup — mirrors
// app/api/webhooks/kajabi/route.ts's purchase.created block (student
// upsert, auth user + profile provisioning), minus anything
// Kajabi-specific. Matches an existing student by EMAIL first (not
// stripe_customer_id, which can't exist yet on a first purchase) so a
// student who somehow already has a row (e.g. admin/ambassador-
// provisioned) gets that row attached to Stripe rather than erroring on
// the table's unique email constraint. Always stamps stripe_account:
// "own" — new signups never happen on Opus (see caller).
async function handleCheckoutCompleted(admin: AdminClient, session: Stripe.Checkout.Session) {
  const tier = session.metadata?.tier as Tier | undefined;
  const email = session.customer_details?.email ?? session.customer_email;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!tier || !email || !customerId) {
    console.error("checkout.session.completed missing tier/email/customer", { tier, email, customerId });
    return;
  }

  const { data: existing } = await admin
    .from("students")
    .select("id, profile_id, tier")
    .ilike("email", email)
    .maybeSingle();

  let studentId: string;
  let priorTier: Tier | null = null;
  let profileId: string | null = null;

  if (existing) {
    studentId = existing.id;
    priorTier = existing.tier as Tier;
    profileId = existing.profile_id;
    await admin
      .from("students")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId ?? null,
        stripe_account: "own",
        tier,
        subscription_status: "active",
        payment_status: "ok",
      })
      .eq("id", studentId);
  } else {
    const { data: inserted, error } = await admin
      .from("students")
      .insert({
        email,
        name: session.customer_details?.name ?? "",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId ?? null,
        stripe_account: "own",
        tier,
        subscription_status: "active",
        payment_status: "ok",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("checkout.session.completed: student insert failed", error);
      return;
    }
    studentId = inserted.id;
  }

  // Anchors the billing cycle, same guarded-once pattern as the Kajabi
  // webhook — set only if this student has never had one.
  await admin
    .from("students")
    .update({ billing_anniversary_date: new Date().toISOString().slice(0, 10) })
    .eq("id", studentId)
    .is("billing_anniversary_date", null);

  if (tier === "suite" || tier === "pro" || tier === "elite") {
    if (priorTier !== tier) {
      await createAttentionItem(admin, {
        kind: `upgraded_${tier}` as AttentionKind,
        studentId,
        summary: `${session.customer_details?.name ?? "A student"} is now on ${tier[0].toUpperCase()}${tier.slice(1)} (Stripe)`,
      });
    }
  }

  if (!profileId) {
    const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (!createErr && authUser.user) {
      await admin.from("profiles").insert({ id: authUser.user.id, role: "student" });
      await admin.from("students").update({ profile_id: authUser.user.id }).eq("id", studentId);
    }
  }

  await syncKajabiForTierChange(admin, { studentId, email, newTier: tier, oldTier: priorTier });

  await issueAndSendBillingWelcomeLink(studentId, email).catch((err) =>
    console.error("Failed to send billing welcome link", err),
  );
}

// A pause_collection object present on the subscription means Stripe has
// suspended billing — checked ahead of the terminal-status mapping below
// since a paused subscription's own `status` field stays "active" the
// whole time it's paused (pausing doesn't change status, it changes
// whether Stripe attempts to collect).
function deriveSubscriptionStatus(subscription: Stripe.Subscription): "active" | "paused" | "cancelled" {
  if (subscription.pause_collection) return "paused";
  if (
    subscription.status === "canceled" ||
    subscription.status === "unpaid" ||
    subscription.status === "incomplete_expired"
  ) {
    return "cancelled";
  }
  return "active";
}

// Authoritative tier/status sync — fires on initial subscription creation
// (right alongside checkout.session.completed) and on every later
// upgrade/downgrade, pause, resume, or scheduled cancellation, from
// either account. Student lookups scope on (stripe_customer_id,
// stripe_account) together — Stripe customer IDs are only unique within
// one account, so without the account scope a coincidental ID match
// across "own" and "opus" could resolve to the wrong student.
async function handleSubscriptionUpdated(admin: AdminClient, subscription: Stripe.Subscription, account: StripeAccount) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceId ? TIER_BY_STRIPE_PRICE_ID[priceId] : undefined;

  const { data: student } = await admin
    .from("students")
    .select("id, name, email, tier")
    .eq("stripe_customer_id", customerId)
    .eq("stripe_account", account)
    .maybeSingle();

  if (!student) {
    // Subscription events can arrive before checkout.session.completed's
    // own write lands (Stripe doesn't guarantee delivery order) — nothing
    // to reconcile yet, checkout.session.completed will set tier itself.
    // For Opus, this is also the normal case until a student's first
    // /billing/account visit links them (see app/api/billing/subscription/
    // route.ts) — nothing to do here either way.
    console.error("subscription event for unlinked stripe customer", customerId, account);
    return;
  }

  const priorTier = student.tier as Tier;
  const status = deriveSubscriptionStatus(subscription);

  await admin
    .from("students")
    .update({
      ...(tier ? { tier } : {}),
      subscription_status: status,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId ?? null,
      stripe_account: account,
    })
    .eq("id", student.id);

  await admin
    .from("students")
    .update({ billing_anniversary_date: new Date().toISOString().slice(0, 10) })
    .eq("id", student.id)
    .is("billing_anniversary_date", null);

  if (tier && (tier === "suite" || tier === "pro" || tier === "elite") && priorTier !== tier) {
    await createAttentionItem(admin, {
      kind: `upgraded_${tier}` as AttentionKind,
      studentId: student.id,
      summary: `${student.name} is now on ${tier[0].toUpperCase()}${tier.slice(1)} (Stripe)`,
    });
  }

  if (tier && tier !== priorTier) {
    await syncKajabiForTierChange(admin, { studentId: student.id, email: student.email, newTier: tier, oldTier: priorTier });
  }

  // Scheduled-cancellation detection — a student who cancelled (Billing
  // Portal or the new /billing/account "Cancel" action) gets
  // cancel_at_period_end flipped true immediately, well before the
  // subscription actually ends (customer.subscription.deleted, handled
  // separately below). Dedup by checking for an existing pending/
  // approved request first, same pattern as
  // app/api/cron/kajabi-sync/route.ts's own existingRequest check.
  if (subscription.cancel_at_period_end) {
    const { data: existingRequest } = await admin
      .from("student_requests")
      .select("id")
      .eq("student_id", student.id)
      .eq("type", "cancel_subscription")
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (!existingRequest) {
      const effectiveDate = new Date(subscription.items.data[0]?.current_period_end
        ? subscription.items.data[0].current_period_end * 1000
        : Date.now()).toISOString().slice(0, 10);

      const { data: inserted } = await admin
        .from("student_requests")
        .insert({
          student_id: student.id,
          type: "cancel_subscription",
          status: "approved",
          reason: "Cancelled via Stripe.",
          effective_date: effectiveDate,
          resolved_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (inserted) {
        await createAttentionItem(admin, {
          kind: "cancel_request",
          studentId: student.id,
          requestId: inserted.id,
          summary: `${student.name} cancelled via Stripe · effective end of cycle ${effectiveDate}`,
        });

        await notifyStaff(admin, {
          kind: "stripe_cancellation",
          dedupKey: subscription.id,
          text: `⚠️ ${student.name} cancelled their subscription via Stripe — effective ${effectiveDate}. See Needs Review.`,
        });
      }
    }
  }
}

async function handleSubscriptionDeleted(admin: AdminClient, subscription: Stripe.Subscription, account: StripeAccount) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { data: student } = await admin
    .from("students")
    .select("id, name, email, tier")
    .eq("stripe_customer_id", customerId)
    .eq("stripe_account", account)
    .maybeSingle();

  if (!student) return;

  await admin.from("students").update({ subscription_status: "cancelled" }).eq("id", student.id);

  await syncKajabiForTierChange(admin, {
    studentId: student.id,
    email: student.email,
    newTier: null,
    oldTier: student.tier as Tier,
  });

  await notifyStaff(admin, {
    kind: "stripe_subscription_ended",
    dedupKey: subscription.id,
    text: `${student.name}'s subscription has now ended (Stripe).`,
  });
}
