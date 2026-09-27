import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { getStripeClient } from "@/lib/stripe/client";
import { notifyStaff } from "@/lib/notifications/create";
import { notifyCoachSessionEvent } from "@/lib/notifications/session-events";
import { notifyStudentSessionBooked } from "@/lib/notifications/booking-events";
import { FIFTH_WEEK_SELF_SERVE_ENABLED, findFifthWeekOpportunities, fifthWeekPrice } from "@/lib/scheduling/fifth-week-offers";
import { formatDateTimeInZone } from "@/lib/timezone";

// Student buys their "bonus week" lesson (lib/scheduling/fifth-week-offers.ts)
// from the dashboard card: one tap charges the card on file and books the
// lesson in their usual slot (studio call 2026-09-26). Order matters:
// re-check the offer and the slot → charge → book. If the booking insert
// fails after a successful charge, the charge is refunded immediately so a
// student is never charged for a lesson that doesn't exist.
const CUTOFF_MS = 6 * 60 * 60 * 1000; // same cutoff as the offer cron

// Same card-on-file resolution the add-on shop uses
// (app/api/billing/addons/purchase) — subscription default first, then the
// customer's invoice default.
function paymentMethodOf(subscription: Stripe.Subscription): string | null {
  const subPm = subscription.default_payment_method;
  if (subPm) return typeof subPm === "string" ? subPm : subPm.id;
  const customer = subscription.customer;
  if (customer && typeof customer !== "string" && !customer.deleted) {
    const pm = customer.invoice_settings?.default_payment_method;
    if (pm) return typeof pm === "string" ? pm : pm.id;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!FIFTH_WEEK_SELF_SERVE_ENABLED) {
    return NextResponse.json({ error: "Bonus lessons aren't available yet." }, { status: 403 });
  }
  const { occurrenceAt } = (await req.json()) as { occurrenceAt?: string };
  if (!occurrenceAt) return NextResponse.json({ error: "occurrenceAt required" }, { status: 400 });

  const billing = await resolveBillingStudent();
  if (!billing) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!billing.stripeCustomerId || !billing.stripeSubscriptionId || !billing.stripeAccount) {
    return NextResponse.json({ error: "No billing account linked — please contact the studio." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Still a real, open offer for THIS student at THIS time?
  const [offer] = (await findFifthWeekOpportunities(admin, { studentId: billing.studentId })).filter(
    (o) => o.occurrenceAt.toISOString() === new Date(occurrenceAt).toISOString(),
  );
  if (!offer || offer.noBonusLesson) return NextResponse.json({ error: "This bonus lesson isn't available anymore." }, { status: 409 });
  if (offer.occurrenceAt.getTime() - Date.now() < CUTOFF_MS) {
    return NextResponse.json({ error: "It's too close to the lesson to add it now." }, { status: 409 });
  }
  const slotStart = offer.occurrenceAt.toISOString();
  const slotEnd = new Date(offer.occurrenceAt.getTime() + offer.durationMinutes * 60 * 1000);

  // 2. Coach still free then? (another booking or a group class)
  const [{ data: clash }, { data: nearbyGroups }] = await Promise.all([
    admin
      .from("sessions")
      .select("id")
      .eq("actual_coach_id", offer.coachId)
      .eq("scheduled_at", slotStart)
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,holiday)")
      .maybeSingle(),
    admin
      .from("group_lessons")
      .select("scheduled_at, duration_minutes")
      .eq("coach_id", offer.coachId)
      .is("cancelled_at", null)
      .gte("scheduled_at", new Date(offer.occurrenceAt.getTime() - 4 * 60 * 60 * 1000).toISOString())
      .lte("scheduled_at", slotEnd.toISOString()),
  ]);
  const groupClash = (nearbyGroups ?? []).some((g) => {
    const s = new Date(g.scheduled_at);
    const e = new Date(s.getTime() + g.duration_minutes * 60 * 1000);
    return offer.occurrenceAt < e && slotEnd > s;
  });
  if (clash || groupClash) {
    return NextResponse.json({ error: "Your coach isn't free at that time anymore — please contact the studio." }, { status: 409 });
  }

  // 3. Charge the card on file.
  const price = await fifthWeekPrice(offer.durationMinutes);
  if (!price) return NextResponse.json({ error: "Bonus lessons aren't available right now." }, { status: 400 });

  const client = getStripeClient(billing.stripeAccount);
  const subscription = await client.subscriptions.retrieve(billing.stripeSubscriptionId, {
    expand: ["default_payment_method", "customer", "customer.invoice_settings.default_payment_method"],
  });
  const paymentMethod = paymentMethodOf(subscription);
  if (!paymentMethod) {
    return NextResponse.json({ error: "No payment method on file — update your payment method first." }, { status: 400 });
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await client.paymentIntents.create({
      customer: billing.stripeCustomerId,
      payment_method: paymentMethod,
      amount: price.amount,
      currency: price.currency,
      off_session: true,
      confirm: true,
      description: `Bonus lesson (5th week) — ${formatDateTimeInZone(slotStart, offer.coachTimezone)}`,
      receipt_email: billing.email,
      metadata: { purpose: "fifth_week_lesson", student_id: billing.studentId, occurrence_at: slotStart },
    },
    // A double-tap (or retry) hands back the SAME PaymentIntent instead of
    // charging twice — Stripe keeps idempotency keys for 24h.
    { idempotencyKey: `fifth_week:${billing.studentId}:${slotStart}` },
    );
  } catch (err) {
    console.error("fifth-week charge failed", err);
    const message =
      err instanceof Stripe.errors.StripeCardError
        ? err.message
        : "Your card couldn't be charged — try again or update your payment method.";
    return NextResponse.json({ error: message }, { status: 402 });
  }

  // 4. Book it. A concurrent duplicate request (same idempotent charge)
  // may have booked it already — then just report success, never a
  // second session.
  const { data: already } = await admin
    .from("sessions")
    .select("id")
    .eq("student_id", billing.studentId)
    .eq("scheduled_at", slotStart)
    .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,holiday)")
    .maybeSingle();
  if (already) return NextResponse.json({ success: true, sessionId: already.id });

  // On failure, refund — never charge for a lesson that isn't there.
  const { data: session, error: insertError } = await admin
    .from("sessions")
    .insert({
      student_id: billing.studentId,
      actual_coach_id: offer.coachId,
      scheduled_at: slotStart,
      duration_minutes: offer.durationMinutes,
      status: "scheduled",
      is_makeup: false,
    })
    .select("id")
    .single();

  if (insertError || !session) {
    console.error("fifth-week booking failed after charge — refunding", insertError);
    await client.refunds.create({ payment_intent: paymentIntent.id }).catch((err) => {
      console.error(`REFUND FAILED for ${paymentIntent.id} — refund by hand`, err);
    });
    await notifyStaff(admin, {
      kind: "fifth_week_booking_failed",
      dedupKey: paymentIntent.id,
      text: `⚠️ ${billing.name}'s bonus lesson charge went through but booking failed — refund issued automatically (${paymentIntent.id}). Please check.`,
    });
    return NextResponse.json({ error: "We couldn't book that lesson, so your card was refunded. Please contact the studio." }, { status: 500 });
  }

  // 5. Close the admin "5th Week" item for this slot, and tell everyone.
  await admin
    .from("attention_items")
    .update({ status: "resolved", admin_note: "Student added it themselves", updated_at: new Date().toISOString() })
    .eq("kind", "fifth_week_available")
    .eq("student_id", billing.studentId)
    .eq("occurrence_at", slotStart)
    .neq("status", "resolved");

  void notifyStudentSessionBooked(session.id);
  notifyCoachSessionEvent(session.id, "session_booked").catch((err) =>
    console.error(`coach notification failed for bonus lesson ${session.id}`, err),
  );
  await notifyStaff(admin, {
    kind: "fifth_week_purchase",
    dedupKey: paymentIntent.id,
    text: `💜 ${billing.name} added their bonus 5th-week lesson (${formatDateTimeInZone(slotStart, offer.coachTimezone)}) for ${price.label}.`,
  });

  return NextResponse.json({ success: true, sessionId: session.id });
}
