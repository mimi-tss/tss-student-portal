import { NextRequest, NextResponse } from "next/server";
import { verifyKajabiWebhookSecret } from "@/lib/kajabi/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueAndSendLoginLink } from "@/lib/auth/magic-link";

// Direct Kajabi API/webhook integration — no Zapier — per
// TSS_App_Spec_1.md section 1 & 3.
//
// Kajabi's *only* outbound webhook events, confirmed from the actual
// Kajabi dashboard's Webhooks screen (the docs described a different,
// wrong set — order.created/cart.purchase split that doesn't exist in the
// real UI): order.created and payment.succeeded. There is NO
// subscription-cancelled or payment-failed event, so cancellation and DNC
// sync can't be event-driven here; that's handled by the polling job in
// app/api/cron/kajabi-sync instead. This handler only covers what a real
// webhook can tell us: new/renewed access.
//
// Kajabi also doesn't sign webhook payloads at all (confirmed absent from
// their docs), so the webhook URL configured in Kajabi must include
// ?secret=<KAJABI_WEBHOOK_SECRET> — that's what's actually checked below,
// not a header.
//
// TODO: the payload shape below (member/offer/payment_transaction as
// top-level siblings, plus an `event` field) is still reconstructed from
// Kajabi's webhook data-reference docs, not a captured real payload —
// confirm field names against an actual delivery once one arrives. There's
// also no confirmed unique delivery/event id, so idempotency below keys off
// payment_transaction.id, which may not cover every event type.
type KajabiWebhookPayload = {
  event: string; // "order.created" | "payment.succeeded"
  member: { id: string; email: string; first_name?: string; last_name?: string };
  offer?: { id: string; title: string };
  payment_transaction?: { id: string };
};

const TIER_BY_OFFER_TITLE: Record<string, string> = {
  "Sing Smarter Suite": "suite",
  "Sing Smarter Pro": "pro",
  "Sing Smarter Elite": "elite",
};

export async function POST(req: NextRequest) {
  const providedSecret = req.nextUrl.searchParams.get("secret");

  if (!verifyKajabiWebhookSecret(providedSecret)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const rawBody = await req.text();
  const event = JSON.parse(rawBody) as KajabiWebhookPayload;
  const admin = createAdminClient();
  const dedupeKey = event.payment_transaction?.id ?? `${event.event}:${event.member.id}`;

  // Idempotency: webhook senders (Kajabi included) retry on timeout, so a
  // duplicate delivery must not double-provision or double-send emails.
  const { error: dupeError } = await admin
    .from("kajabi_events")
    .insert({ kajabi_event_id: dedupeKey, type: event.event, payload: event });

  if (dupeError) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const member = event.member;

  switch (event.event) {
    case "order.created": {
      const tier = event.offer ? (TIER_BY_OFFER_TITLE[event.offer.title] ?? "lite") : "lite";

      const { data: student } = await admin
        .from("students")
        .upsert(
          {
            email: member.email,
            name: `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim(),
            kajabi_customer_id: member.id,
            tier,
            subscription_status: "active",
            payment_status: "ok",
          },
          { onConflict: "kajabi_customer_id" },
        )
        .select("id, profile_id")
        .single();

      // First time we've seen this contact: create their (passwordless)
      // Supabase auth user + profile now, so the login route never has to.
      if (student && !student.profile_id) {
        const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
          email: member.email,
          email_confirm: true,
        });

        if (!createErr && authUser.user) {
          await admin.from("profiles").insert({ id: authUser.user.id, role: "student" });
          await admin
            .from("students")
            .update({ profile_id: authUser.user.id })
            .eq("id", student.id);
        }
      }

      if (student) {
        await issueAndSendLoginLink(student.id, member.email);
      }
      break;
    }

    case "payment.succeeded": {
      // A recurring payment landing successfully clears any prior DNC flag.
      await admin
        .from("students")
        .update({ payment_status: "ok" })
        .eq("kajabi_customer_id", member.id);
      break;
    }

    default:
      break;
  }

  await admin
    .from("kajabi_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("kajabi_event_id", dedupeKey);

  return NextResponse.json({ received: true });
}
