import type { SupabaseClient } from "@supabase/supabase-js";
import { grantKajabiOffer, revokeKajabiOffer } from "@/lib/kajabi/client";
import { OFFER_IDS } from "@/lib/kajabi/offers";
import { createAttentionItem } from "@/lib/admin/attention-items";
import type { Tier } from "@/types/database";

const OFFER_ID_BY_TIER: Record<Tier, string> = {
  lite: OFFER_IDS.LITE,
  suite: OFFER_IDS.SUITE,
  pro: OFFER_IDS.PRO_MASTER,
  elite: OFFER_IDS.ELITE_MASTER,
};

// Keeps Kajabi course/content access in sync with a Stripe-billed
// student's current tier. Deliberately best-effort: Stripe stays the
// source of truth for billing regardless of whether this succeeds, so a
// Kajabi outage must never block or roll back the Stripe-side write that
// already happened in the webhook handler that calls this.
export async function syncKajabiForTierChange(
  admin: SupabaseClient,
  { studentId, email, newTier, oldTier }: { studentId: string; email: string; newTier: Tier | null; oldTier: Tier | null },
) {
  try {
    if (newTier) await grantKajabiOffer(email, OFFER_ID_BY_TIER[newTier]);
    if (oldTier && oldTier !== newTier) await revokeKajabiOffer(email, OFFER_ID_BY_TIER[oldTier]);
  } catch (err) {
    console.error("Kajabi sync failed", err);
    await createAttentionItem(admin, {
      kind: "kajabi_grant_failed",
      studentId,
      summary: newTier
        ? `Stripe tier is now ${newTier} but the Kajabi course-access grant failed — check Kajabi manually`
        : `Stripe subscription ended but revoking Kajabi course access failed — check Kajabi manually`,
    });
  }
}
