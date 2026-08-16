import { NextRequest, NextResponse } from "next/server";
import { getKajabiContactOfferIds } from "@/lib/kajabi/client";
import { OFFER_IDS, TIER_BY_OFFER_ID } from "@/lib/kajabi/offers";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .select("id, email, subscription_status, session_duration_minutes")
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
