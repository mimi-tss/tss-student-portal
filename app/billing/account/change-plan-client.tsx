"use client";

import { useEffect, useState } from "react";
import type { Tier } from "@/types/database";
import { TIER_COPY, ELITE_APPLICATION_EMAIL } from "@/lib/billing/tier-copy";
import { TierCard, IntervalToggle, type TierPricing } from "../tier-card";
import styles from "../billing.module.css";

type PricingData = Record<Tier, TierPricing>;

// Same visual tier-card grid as the public pricing page (app/billing/
// pricing-client.tsx) — the student asked to see and compare plans the
// same way, not pick from a plain dropdown. Unlike pause/cancel, this is
// self-serve and instant: selecting a tier and confirming swaps the
// Stripe subscription's price right away (see the API route) — staff
// just get a Slack heads-up, no approval step.
//
// Interval is Monthly/Yearly only, via one shared toggle above the grid
// — unlike the public pricing page's per-card picker, an existing
// student changing plans never sees the 3-month/6-month promotional
// intervals (those stay checkout-only, for new signups).
export default function ChangePlanClient({
  currentTier,
  onDone,
}: {
  currentTier: Tier | null | undefined;
  onDone: () => void;
}) {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
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
                  // Still clickable even when this is the student's current
                  // tier — a legacy/Opus-priced student staying on the same
                  // tier can use this to move onto the current standard
                  // price instead of doing nothing (the ribbon alone marks
                  // "current", it doesn't lock the button).
                  <button
                    type="button"
                    className={styles.cta}
                    disabled={!price}
                    onClick={() => setSelectedTier(t.tier)}
                  >
                    {isChosen ? "Selected" : isCurrent ? `Update ${t.name} pricing` : `Select ${t.name}`}
                  </button>
                )
              }
            />
          );
        })}
      </div>

      {selectedTier && (
        <form onSubmit={submit} className={`${styles.card} ${styles.form}`} style={{ maxWidth: 480, marginTop: 16 }}>
          <p className={styles.helpText} style={{ margin: 0 }}>
            {selectedTier === currentTier ? (
              <>
                Moving to the current <strong>{TIER_COPY.find((t) => t.tier === selectedTier)?.name}</strong>{" "}
                pricing — takes effect right away.
              </>
            ) : (
              <>
                Switching to <strong>{TIER_COPY.find((t) => t.tier === selectedTier)?.name}</strong> — takes effect
                right away.
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
          <button type="submit" className={styles.cta} disabled={submitting}>
            {submitting ? "Switching…" : "Confirm plan change"}
          </button>
        </form>
      )}
    </div>
  );
}
