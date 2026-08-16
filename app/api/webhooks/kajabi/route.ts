import { NextRequest, NextResponse } from "next/server";
import { verifyKajabiWebhookSecret } from "@/lib/kajabi/client";
import { OFFER_IDS, TIER_BY_OFFER_ID } from "@/lib/kajabi/offers";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueAndSendLoginLink } from "@/lib/auth/magic-link";

// Direct Kajabi API/webhook integration — no Zapier — per
// TSS_App_Spec_1.md section 1 & 3.
//
// Kajabi has two *separate* webhook configuration surfaces — found the
// hard way, via real test purchases, not docs:
//  - Settings → Third Party Integrations and Webhooks (global, picks an
//    event type from a dropdown): only payment.succeeded actually fires
//    from here for a real purchase. "order.created" is selectable in that
//    dropdown but never fired for any real or coupon purchase tested.
//  - Sales → Offers → [offer] → "···" → Webhooks → "Purchase Webhook URL":
//    must be set on EVERY offer individually (not global). This is what
//    actually fires on purchase — event name "purchase.created" — and its
//    payload is a completely different, flatter shape than the global
//    tab's events (flat member_*/offer_title fields nested one level
//    under `payload`, not `member{}`/`offer{}` objects).
// There is still no cancelled/payment-failed event of any kind from
// either surface; that's handled by the polling job in
// app/api/cron/kajabi-sync instead.
//
// Kajabi doesn't sign webhook payloads at all, so the webhook URL
// configured in Kajabi (both surfaces) must include
// ?secret=<KAJABI_WEBHOOK_SECRET> — checked below, not a header.
//
// Offer IDs confirmed live via GET /v1/offers (see TSS_App_Spec_1.md
// section 2) — there are 11 real offers total, only 5 of which are
// tier-relevant. Coach Tara's two offers ("...Coach Tara") exist purely
// to gate Kajabi's own Courses/Community content and are never
// purchased through checkout (links hidden) — her students are
// provisioned entirely through the admin ambassador tool instead, paid
// via Stripe (not yet integrated). The legacy "Sing Smarter Elite"
// offer (no suffix, $2,799/6mo) isn't mapped either — any existing
// subscribers on it still get payment_status synced fine via the
// tier-agnostic global payment.succeeded handler below. See
// lib/kajabi/offers.ts for the OFFER_IDS/TIER_BY_OFFER_ID mapping,
// shared with the polling job in app/api/cron/kajabi-sync.
type KajabiWebhookPayload = {
  id: string;
  event: string; // "purchase.created" | "payment.succeeded"
  // payment.succeeded shape (global webhook tab)
  member?: { id: number; email: string; first_name?: string; last_name?: string };
  offer?: { id: number; title: string };
  payment_transaction?: { id: number };
  // purchase.created shape (per-offer "Purchase Webhook URL")
  payload?: {
    member_id: number;
    member_email: string;
    member_first_name?: string;
    member_last_name?: string;
    offer_id: number;
    offer_title?: string;
    transaction_id: number;
  };
};

export async function POST(req: NextRequest) {
  const providedSecret = req.nextUrl.searchParams.get("secret");

  if (!verifyKajabiWebhookSecret(providedSecret)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const rawBody = await req.text();
  const event = JSON.parse(rawBody) as KajabiWebhookPayload;
  const admin = createAdminClient();

  // Idempotency: webhook senders (Kajabi included) retry on timeout, so a
  // duplicate delivery must not double-provision or double-send emails.
  const { error: dupeError } = await admin
    .from("kajabi_events")
    .insert({ kajabi_event_id: event.id, type: event.event, payload: event });

  if (dupeError) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.event) {
    case "purchase.created": {
      const purchase = event.payload;
      if (!purchase) break;

      const offerId = String(purchase.offer_id);

      // The 60-min add-on layers on top of an existing Pro/Elite
      // subscription — it changes session duration, not tier. Doesn't
      // touch anything else about the student's record.
      if (offerId === OFFER_IDS.ADDON_60MIN) {
        await admin
          .from("students")
          .update({ session_duration_minutes: 60 })
          .eq("kajabi_customer_id", String(purchase.member_id));
        break;
      }

      const tier = TIER_BY_OFFER_ID[offerId];
      if (!tier) {
        // Not one of the 5 tier-relevant offers (mini course, master
        // course, workbook, Coach Tara's content-gating offers, the
        // legacy Elite offer, etc.) — deliberately don't touch the
        // student's existing tier. Previously this defaulted unknown
        // offers to "lite", which would have silently downgraded an
        // existing Pro/Elite student the moment they bought an unrelated
        // add-on course — a real bug, caught once the full offer list
        // (11 offers, not the 3 originally assumed) came back from the
        // Kajabi API.
        break;
      }

      const { data: student } = await admin
        .from("students")
        .upsert(
          {
            email: purchase.member_email,
            name: `${purchase.member_first_name ?? ""} ${purchase.member_last_name ?? ""}`.trim(),
            kajabi_customer_id: String(purchase.member_id),
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
          email: purchase.member_email,
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

      // First time reaching Suite: grant the one lifetime trial-lesson
      // entitlement (section 2/5). Only ever granted once per student —
      // if they later upgrade then downgrade back to Suite, this row
      // already exists (used or not) so it's never re-granted.
      if (student && tier === "suite") {
        const { data: existing } = await admin
          .from("entitlements")
          .select("id")
          .eq("student_id", student.id)
          .eq("perk_type", "trial_lesson")
          .maybeSingle();

        if (!existing) {
          await admin.from("entitlements").insert({
            student_id: student.id,
            perk_type: "trial_lesson",
            recurrence: "one-time",
          });
        }
      }

      if (student) {
        await issueAndSendLoginLink(student.id, purchase.member_email);
      }
      break;
    }

    case "payment.succeeded": {
      // A recurring payment landing successfully clears any prior DNC flag.
      if (!event.member) break;

      await admin
        .from("students")
        .update({ payment_status: "ok" })
        .eq("kajabi_customer_id", String(event.member.id));
      break;
    }

    default:
      break;
  }

  await admin
    .from("kajabi_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("kajabi_event_id", event.id);

  return NextResponse.json({ received: true });
}
