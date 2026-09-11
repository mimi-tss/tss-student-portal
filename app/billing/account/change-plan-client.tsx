"use client";

import { useEffect, useState } from "react";
import type { Tier } from "@/types/database";
import { formatPrice, BILLING_INTERVALS, INTERVAL_LABEL, type BillingInterval } from "@/lib/stripe/tiers";
import { TIER_COPY } from "@/lib/billing/tier-copy";
import styles from "../billing.module.css";

interface PriceInfo {
  amount: number | null;
  currency: string | null;
}
type PricingData = Record<Tier, Record<BillingInterval, PriceInfo | null>>;

// Same visual tier-card grid as the public pricing page (app/billing/
// pricing-client.tsx) — the student asked to see and compare plans the
// same way, not pick from a plain dropdown. The real difference is the
// interaction model: a card here only *selects* a tier (highlights it)
// rather than redirecting straight to Stripe Checkout — change-plan is
// request-gated like pause/cancel, so a reason is required and nothing
// touches Stripe until admin approves it.
export default function ChangePlanClient({
  currentTier,
  onDone,
}: {
  currentTier: Tier | null | undefined;
  onDone: () => void;
}) {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [interval, setInterval] = useState<Record<Tier, BillingInterval>>({
    lite: "monthly",
    suite: "monthly",
    pro: "monthly",
    elite: "monthly",
  });
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/pricing")
      .then((res) => res.json())
      .then((data) => setPricing(data.pricing ?? null))
      .catch(() => setPricing(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTier || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/billing/request-change-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: selectedTier, interval: interval[selectedTier], reason }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't submit your plan change request.");
      return;
    }
    onDone();
  }

  return (
    <div>
      {error && <p className={styles.errorText}>{error}</p>}
      <div className={styles.tierGrid}>
        {TIER_COPY.map((t) => {
          const prices = pricing?.[t.tier];
          const availableIntervals = BILLING_INTERVALS.filter((i) => prices?.[i]);
          const selectedInterval = interval[t.tier];
          const price = prices?.[selectedInterval] ?? null;
          const isCurrent = t.tier === currentTier;
          const isChosen = t.tier === selectedTier;

          return (
            <div
              key={t.tier}
              className={styles.tierCard}
              style={isChosen ? { outline: "2px solid var(--gold)", outlineOffset: 2 } : undefined}
            >
              <div className={styles.tierName}>
                {t.name} {isCurrent && <span className={styles.statLabel} style={{ fontSize: 12 }}>(current)</span>}
              </div>
              <p className={styles.tierDesc}>{t.desc}</p>

              <ul className={styles.featureList}>
                {t.features.map((f) => (
                  <li key={f} className={styles.featureItem}>
                    <span className={styles.featureCheck}>✓</span> {f}
                  </li>
                ))}
              </ul>

              {availableIntervals.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {availableIntervals.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={selectedInterval === i ? styles.badge : styles.linkBtn}
                      onClick={() => setInterval((prev) => ({ ...prev, [t.tier]: i }))}
                    >
                      {INTERVAL_LABEL[i]}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.tierName} style={{ fontSize: 22 }}>
                {formatPrice(price?.amount, price?.currency) ?? "—"}
                {price && price.amount !== 0 && (
                  <span className={styles.statLabel} style={{ fontSize: 13 }}>
                    {" "}
                    / {INTERVAL_LABEL[selectedInterval]}
                  </span>
                )}
              </div>

              <button
                type="button"
                className={styles.cta}
                disabled={isCurrent || !price}
                onClick={() => setSelectedTier(t.tier)}
              >
                {isCurrent ? "Current plan" : isChosen ? "Selected" : `Select ${t.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {selectedTier && (
        <form onSubmit={submit} className={`${styles.card} ${styles.form}`} style={{ maxWidth: 480, marginTop: 16 }}>
          <p className={styles.helpText} style={{ margin: 0 }}>
            Switching to <strong>{TIER_COPY.find((t) => t.tier === selectedTier)?.name}</strong> — the studio will
            review and confirm before it changes.
          </p>
          <label className={styles.statLabel} htmlFor="changePlanReason">
            Reason
          </label>
          <textarea
            id="changePlanReason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.cta} disabled={submitting}>
            {submitting ? "Sending…" : "Send plan change request"}
          </button>
        </form>
      )}
    </div>
  );
}
