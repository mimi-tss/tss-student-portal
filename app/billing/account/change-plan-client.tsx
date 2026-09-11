"use client";

import { useEffect, useState } from "react";
import type { Tier, StripeAccount } from "@/types/database";
import { TIER_RANK } from "@/lib/stripe/tiers";
import { TIER_COPY, ELITE_APPLICATION_EMAIL, featuresLostGoingTo } from "@/lib/billing/tier-copy";
import { TierCard, IntervalToggle, type TierPricing } from "../tier-card";
import MigrateCardForm from "./migrate-card-form";
import styles from "../billing.module.css";

type PricingData = Record<Tier, TierPricing>;

// Same visual tier-card grid as the public pricing page (app/billing/
// pricing-client.tsx) — the student asked to see and compare plans the
// same way, not pick from a plain dropdown.
//
// Two very different things happen after a student picks a tier here,
// depending on which Stripe account they're actually on:
//  - "own" (current billing): instant self-serve swap, same as before —
//    no admin approval, just a Slack heads-up afterward.
//  - "opus" (legacy billing): Opus's saved card can't be reused (it
//    belongs to a different Stripe account entirely), so this prompts
//    for a new card and then creates a real new subscription on "own",
//    trial_end-anchored to their current Opus period end so they're
//    never charged twice — see .../migrate/setup-intent and
//    .../migrate/complete.
// A downgrade (lower-ranked tier, either path) always confirms first —
// a plain pop-up listing exactly what they'd lose access to.
//
// Interval is Monthly/Yearly only, via one shared toggle above the grid
// — unlike the public pricing page's per-card picker, an existing
// student changing plans never sees the 3-month/6-month promotional
// intervals (those stay checkout-only, for new signups).
export default function ChangePlanClient({
  currentTier,
  stripeAccount,
  onDone,
}: {
  currentTier: Tier | null | undefined;
  stripeAccount: StripeAccount | null | undefined;
  onDone: (message?: string) => void;
}) {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [downgradeConfirmed, setDowngradeConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/pricing")
      .then((res) => res.json())
      .then((data) => setPricing(data.pricing ?? null))
      .catch(() => setPricing(null));
  }, []);

  function chooseTier(tier: Tier) {
    setSelectedTier(tier);
    setDowngradeConfirmed(false);
    setError(null);
  }

  const isDowngrade =
    !!selectedTier && !!currentTier && TIER_RANK[selectedTier] < TIER_RANK[currentTier] && selectedTier !== currentTier;
  const lostFeatures = selectedTier && currentTier ? featuresLostGoingTo(currentTier, selectedTier) : [];
  const showDowngradeModal = isDowngrade && !downgradeConfirmed;
  const showNextStep = !!selectedTier && (!isDowngrade || downgradeConfirmed);
  const isMigration = stripeAccount === "opus";

  async function submit() {
    if (!selectedTier) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/billing/request-change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: selectedTier, interval, reason }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't change your plan.");
      return;
    }
    onDone();
  }

  return (
    <div>
      {error && <p className={styles.errorText}>{error}</p>}
      <div style={{ textAlign: "center" }}>
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>
      <div className={styles.tierGrid}>
        {TIER_COPY.map((t) => {
          const isCurrent = t.tier === currentTier;
          const isChosen = t.tier === selectedTier;
          const price = pricing?.[t.tier]?.[interval] ?? pricing?.[t.tier]?.monthly ?? null;

          return (
            <TierCard
              key={t.tier}
              tier={t}
              prices={pricing?.[t.tier]}
              selectedInterval={interval}
              onSelectInterval={() => {}}
              showIntervalPicker={false}
              isCurrent={isCurrent}
              highlighted={isChosen}
              action={
                t.applyOnly ? (
                  isCurrent ? (
                    <button type="button" className={styles.cta} disabled>
                      Current plan
                    </button>
                  ) : (
                    <a
                      className={styles.cta}
                      style={{ display: "block", textAlign: "center", textDecoration: "none" }}
                      href={`mailto:${ELITE_APPLICATION_EMAIL}?subject=${encodeURIComponent(`${t.name} application`)}`}
                    >
                      Contact us
                    </a>
                  )
                ) : (
                  <button type="button" className={styles.cta} disabled={!price} onClick={() => chooseTier(t.tier)}>
                    {isChosen ? "Selected" : isCurrent ? `Update ${t.name} pricing` : `Select ${t.name}`}
                  </button>
                )
              }
            />
          );
        })}
      </div>

      {showDowngradeModal && selectedTier && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.tierName} style={{ marginBottom: 12 }}>
              Switch to {TIER_COPY.find((t) => t.tier === selectedTier)?.name}?
            </div>
            {lostFeatures.length > 0 && (
              <>
                <p className={styles.helpText} style={{ margin: "0 0 8px" }}>
                  You&apos;ll lose access to:
                </p>
                <ul className={styles.featureList} style={{ flex: "none", marginBottom: 20 }}>
                  {lostFeatures.map((f) => (
                    <li key={f} className={styles.featureItem}>
                      <span className={styles.errorText} style={{ margin: 0 }}>
                        ✕
                      </span>{" "}
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setSelectedTier(null);
                }}
              >
                Never mind
              </button>
              <button
                type="button"
                className={styles.cta}
                style={{ marginLeft: "auto" }}
                onClick={() => setDowngradeConfirmed(true)}
              >
                Yes, switch plans
              </button>
            </div>
          </div>
        </div>
      )}

      {showNextStep && selectedTier && (
        <div className={`${styles.card} ${styles.form}`} style={{ maxWidth: 480, marginTop: 16 }}>
          <p className={styles.helpText} style={{ margin: 0 }}>
            {selectedTier === currentTier ? (
              <>
                Moving to the current <strong>{TIER_COPY.find((t) => t.tier === selectedTier)?.name}</strong>{" "}
                pricing.
              </>
            ) : (
              <>
                Switching to <strong>{TIER_COPY.find((t) => t.tier === selectedTier)?.name}</strong>
                {!isMigration && " — takes effect right away."}
              </>
            )}
          </p>
          <label className={styles.statLabel} htmlFor="changePlanReason">
            Note (optional)
          </label>
          <textarea
            id="changePlanReason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={styles.input}
          />

          {isMigration ? (
            <MigrateCardForm tier={selectedTier} interval={interval} reason={reason} onDone={onDone} />
          ) : (
            <button type="button" className={styles.cta} disabled={submitting} onClick={submit}>
              {submitting ? "Switching…" : "Confirm plan change"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
