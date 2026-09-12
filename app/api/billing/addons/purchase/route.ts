import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { notifyStaff } from "@/lib/notifications/create";
import { findAddon, resolveAddonPriceId } from "@/lib/billing/addons";
import { getStripeClient } from "@/lib/stripe/client";
import { resolveTierFromPrice } from "@/lib/stripe/tiers";
import { registerStudentInGroupLesson, notifyCoachOfGroupLessonSignup } from "@/lib/group-lessons";

// One-time add-ons (lib/billing/addons.ts, kind: "one_time") — a straight
// off-session charge against the student's card on file, no ongoing
// subscription state, repeatable by design (e.g. Spotlight, bought fresh
// for every recital). This is the first one-time (non-subscription)
// Stripe charge anywhere in this codebase — see that file's own header
// comment; everything else here is subscriptions.
//
// Drop-In additionally claims a real capacity-checked spot in the
// group-lesson system — registerStudentInGroupLesson is the exact same
// function admin registration already goes through (lib/group-lessons.ts),
// used here with the admin client for the same reason redeem-credit's
// route does (a student has no RLS write access to arbitrary
// group_lesson_registrations rows, only admin does). The spot is claimed
// FIRST, then charged: a failed charge releases the spot again rather
// than ever billing a student who didn't end up with a confirmed spot.
function resolvePaymentMethodId(subscription: Stripe.Subscription): string | null {
  const subPm = subscription.default_payment_method;
  if (subPm) return typeof subPm === "string" ? subPm : subPm.id;
  const customer = subscription.customer;
  if (customer && typeof customer !== "string" && !customer.deleted) {
    const customerPm = customer.invoice_settings?.default_payment_method;
    if (customerPm) return typeof customerPm === "string" ? customerPm : customerPm.id;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { addonId, groupLessonId } = await req.json();

  if (typeof addonId !== "string" || !addonId) {
    return NextResponse.json({ error: "An add-on is required" }, { status: 400 });
  }

  const addon = findAddon(addonId);
  if (!addon) return NextResponse.json({ error: "Unknown add-on" }, { status: 400 });
  if (addon.kind !== "one_time") {
    return NextResponse.json({ error: "This add-on is toggled, not purchased — see /api/billing/addons/toggle." }, { status: 400 });
  }
  if (addon.requiresGroupLessonSpot && typeof groupLessonId !== "string") {
    return NextResponse.json({ error: "Choose a group lesson spot first." }, { status: 400 });
  }

  const priceId = resolveAddonPriceId(addon);
  if (!priceId) return NextResponse.json({ error: `${addon.label} isn't available right now.` }, { status: 400 });

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billingStudent.stripeCustomerId || !billingStudent.stripeSubscriptionId || !billingStudent.stripeAccount) {
    return NextResponse.json({ error: "No billing account linked." }, { status: 400 });
  }

  const client = getStripeClient(billingStudent.stripeAccount);
  const subscription = await client.subscriptions.retrieve(billingStudent.stripeSubscriptionId, {
    expand: ["items.data.price", "default_payment_method", "customer", "customer.invoice_settings.default_payment_method"],
  });

  const tier = resolveTierFromPrice(subscription.items.data[0]?.price);
  if (!tier || !addon.tiers.includes(tier)) {
    return NextResponse.json({ error: `${addon.label} isn't available on your current plan.` }, { status: 400 });
  }

  const paymentMethodId = resolvePaymentMethodId(subscription);
  if (!paymentMethodId) {
    return NextResponse.json({ error: "No payment method on file — update your payment method first." }, { status: 400 });
  }

  // The catalog Price never lives on Opus — looked up through the "own"
  // account specifically so this resolves for a legacy (Opus-account)
  // student too. Only the amount/currency is read off it; the actual
  // charge below goes through the student's own account client.
  const catalogPrice = await getStripeClient("own").prices.retrieve(priceId);
  if (catalogPrice.unit_amount == null) {
    return NextResponse.json({ error: `${addon.label} isn't available right now.` }, { status: 400 });
  }

  const admin = createAdminClient();

  if (addon.requiresGroupLessonSpot) {
    try {
      await registerStudentInGroupLesson(admin, {
        groupLessonId: groupLessonId as string,
        studentId: billingStudent.studentId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't claim that spot.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await client.paymentIntents.create({
      customer: billingStudent.stripeCustomerId,
      payment_method: paymentMethodId,
      amount: catalogPrice.unit_amount,
      currency: catalogPrice.currency,
      off_session: true,
      confirm: true,
      description: addon.label,
      metadata: { addon_id: addon.id, student_id: billingStudent.studentId },
    });
  } catch (err) {
    if (addon.requiresGroupLessonSpot) {
      const { error: releaseError } = await admin
        .from("group_lesson_registrations")
        .delete()
        .eq("group_lesson_id", groupLessonId as string)
        .eq("student_id", billingStudent.studentId);
      if (releaseError) console.error("Failed to release a group lesson spot after a failed charge", releaseError.message);
    }
    console.error(`POST /api/billing/addons/purchase charge failed for ${addon.id}`, err);
    const message =
      err instanceof Stripe.errors.StripeCardError
        ? err.message
        : "Your card couldn't be charged — try again or update your payment method.";
    return NextResponse.json({ error: message }, { status: 402 });
  }

  if (addon.requiresGroupLessonSpot) {
    await admin
      .from("group_lesson_registrations")
      .update({ stripe_reference: paymentIntent.id })
      .eq("group_lesson_id", groupLessonId as string)
      .eq("student_id", billingStudent.studentId);

    notifyCoachOfGroupLessonSignup(admin, {
      groupLessonId: groupLessonId as string,
      studentId: billingStudent.studentId,
      studentName: billingStudent.name,
    }).catch((err) => console.error(`Failed to notify coach of drop-in signup for lesson ${groupLessonId}`, err));
  }

  const supabase = await createClient();
  await supabase.from("student_requests").insert({
    student_id: billingStudent.studentId,
    type: "addon_toggle",
    status: "approved",
    addon_id: addon.id,
    addon_action: "purchase",
    resolved_at: new Date().toISOString(),
  });

  await notifyStaff(admin, {
    kind: "addon_purchase",
    dedupKey: paymentIntent.id,
    text: `${billingStudent.name} bought ${addon.label}.`,
  });

  return NextResponse.json({ success: true });
}
