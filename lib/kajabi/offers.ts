// Real Offer IDs confirmed via GET /v1/offers — see TSS_App_Spec_1.md
// section 2 for the full 11-offer picture and why the other 6 aren't
// listed here. Shared between the webhook handler and the polling
// reconciliation job so both stay in sync with the same mapping.
export const OFFER_IDS = {
  LITE: "2151043892",
  SUITE: "2151078893",
  PRO_MASTER: "2151186014",
  ELITE_MASTER: "2151340480",
  ADDON_60MIN: "2151340474",
} as const;

export const TIER_BY_OFFER_ID: Record<string, string> = {
  [OFFER_IDS.LITE]: "lite",
  [OFFER_IDS.SUITE]: "suite",
  [OFFER_IDS.PRO_MASTER]: "pro",
  [OFFER_IDS.ELITE_MASTER]: "elite",
};
