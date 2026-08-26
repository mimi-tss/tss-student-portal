import { NextRequest, NextResponse } from "next/server";
import { getKajabiContactOfferIds } from "@/lib/kajabi/client";
import { OFFER_IDS, TIER_BY_OFFER_ID } from "@/lib/kajabi/offers";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { createAttentionItem } from "@/lib/admin/attention-items";

// Polling fallback for cancellations and the 60-min add-on being removed
// — Kajabi has no webhook for either (see app/api/webhooks/kajabi/route.ts
// for what real events exist). Scheduled every 5 minutes via GitHub
// Actions (.github/workflows/kajabi-sync.yml).
//
// Rebuilt around GET /v1/contacts?filter[email]=..., confirmed to
// actually exist and return relationships.offers.data (a contact's
// current offer holdings) — this route originally called
// listKajabiSubscriptions(), which hit a /v1/subscriptions endpoint that
// turned out not to exist at all (404, confirmed via the real API, not
// assumed).
//
// What this does and doesn't catch: if a student holds none of the 4
// tier offers anymore, they're marked cancelled. If they held the
// 60-min add-on and no longer do, session_duration_minutes reverts to
// 30. It does NOT distinguish a failed payment (DNC) from a genuine
// cancellation — Kajabi's offers-relationship data only shows current
// holdings, not payment status, so a lapsed-payment student who's had
// their offer revoked looks identical to a cancelled one here. Real DNC
// detection remains an open gap (TSS_App_Spec_1.md section 11).
//
// Only checks students who came through an actual Kajabi purchase
// (kajabi_customer_id set) — ambassador-provisioned students (Coach
// Tara's, section 8) never touch Kajabi and are skipped entirely.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: students } = await admin
    .from("students")
    .select("id, name, email, subscription_status, session_duration_minutes, billing_anniversary_date")
    .not("kajabi_customer_id", "is", null)
    .neq("subscription_status", "cancelled");

  let checked = 0;
  let updated = 0;

  for (const student of students ?? []) {
    checked++;

    let offerIds: string[];
    try {
      offerIds = await getKajabiContactOfferIds(student.email);
    } catch (err) {
      console.error(`kajabi-sync: contact lookup failed for ${student.email}`, err);
      continue; // one bad lookup shouldn't break the whole run
    }

    const stillHasTierOffer = offerIds.some((id) => id in TIER_BY_OFFER_ID);
    const stillHasAddon60 = offerIds.includes(OFFER_IDS.ADDON_60MIN);

    if (!stillHasTierOffer) {
      await admin.from("students").update({ subscription_status: "cancelled" }).eq("id", student.id);
      updated++;

      // Surface this to admin (Needs Review) — this used to just flip
      // the status silently, so a real Kajabi cancellation could sit
      // unnoticed until someone happened to open the student's page.
      // Reuses the same student_requests + attention_items shape as the
      // student-submitted and admin-flagged paths (Stop panel on the
      // admin student page, materializeRecurringSessions' cancellation
      // filter) — status is "approved" outright rather than "pending"
      // since this isn't a request to decide on, it already happened in
      // Kajabi; "Mark retained" on the Stop panel is still how admin
      // clears it if they win the student back.
      const { data: existingRequest } = await admin
        .from("student_requests")
        .select("id")
        .eq("student_id", student.id)
        .eq("type", "cancel_subscription")
        .in("status", ["pending", "approved"])
        .maybeSingle();

      if (!existingRequest) {
        const { end: cycleEnd } = currentBillingCycleRange(student.billing_anniversary_date);
        const effectiveDate = cycleEnd.toISOString().slice(0, 10);

        const { data: inserted } = await admin
          .from("student_requests")
          .insert({
            student_id: student.id,
            type: "cancel_subscription",
            status: "approved",
            reason: "Detected via Kajabi — no longer holds an active tier offer.",
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
            summary: `${student.name} — Kajabi shows the subscription is no longer active · effective end of cycle ${effectiveDate}`,
          });
        }
      }
    }

    if (!stillHasAddon60 && student.session_duration_minutes === 60) {
      await admin.from("students").update({ session_duration_minutes: 30 }).eq("id", student.id);
      updated++;
      // TODO: block/adjust any already-booked future 60-min sessions
      // that no longer match the student's entitlement — not handled
      // yet, existing bookings are left as-is.
    }
  }

  return NextResponse.json({ checked, updated });
}
