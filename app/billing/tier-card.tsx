"use client";

import { useState, type ReactNode } from "react";
import type { Tier } from "@/types/database";
import { formatPrice, BILLING_INTERVALS, INTERVAL_LABEL, INTERVAL_MONTHS, type BillingInterval } from "@/lib/stripe/tiers";
import type { TIER_COPY } from "@/lib/billing/tier-copy";
import styles from "./billing.module.css";

interface PriceInfo {
  amount: number | null;
  currency: string | null;
}
export type TierPricing = Record<BillingInterval, PriceInfo | null>;

// One tier card — shared by the public pricing page (pricing-client.tsx)
// and the account page's Change Plan picker (change-plan-client.tsx), so
// the interval/savings math and the "Your Plan" ribbon only exist once.
// The action button differs per caller (start Checkout vs. select a
// target tier vs. a Contact-us mailto for the applyOnly tier), so that's
// the one thing passed in rather than owned here.
export function TierCard({
  tier,
  prices,
  selectedInterval,
  onSelectInterval,
  isCurrent = false,
  highlighted = false,
  showIntervalPicker = true,
  action,
}: {
  tier: (typeof TIER_COPY)[number];
  prices: TierPricing | undefined;
  selectedInterval: BillingInterval;
  onSelectInterval: (interval: BillingInterval) => void;
  isCurrent?: boolean;
  highlighted?: boolean;
  // false when a shared toggle above the whole grid already controls the
  // interval (the Change Plan picker's Monthly/Yearly-only toggle) — the
  // card then just displays that interval's price instead of also
  // offering its own per-card picker.
  showIntervalPicker?: boolean;
  action: ReactNode;
}) {
  const availableIntervals = BILLING_INTERVALS.filter((i) => prices?.[i]);
  // Falls back to the monthly price/interval when this tier has nothing
  // for the externally-selected interval (a free tier under a shared
  // Monthly/Yearly toggle, or any tier missing a yearly price) — avoids
  // a bare "—" for a tier that's simply priced differently, not actually
  // unavailable. `effectiveInterval` (not the raw prop) drives every
  // label/math below so a fallback never mislabels the monthly price as
  // "Yearly".
  const effectiveInterval: BillingInterval = prices?.[selectedInterval] ? selectedInterval : "monthly";
  const price = prices?.[effectiveInterval] ?? null;
  const monthlyPrice = prices?.monthly ?? null;
  const savePct =
    effectiveInterval !== "monthly" && monthlyPrice?.amount && price?.amount
      ? Math.round((1 - price.amount / INTERVAL_MONTHS[effectiveInterval] / monthlyPrice.amount) * 100)
      : null;

  const [expanded, setExpanded] = useState(false);
  const collapseAt = 5;
  const visibleFeatures = expanded || tier.features.length <= collapseAt ? tier.features : tier.features.slice(0, collapseAt);

  return (
    <div className={styles.tierCard} style={highlighted ? { outline: "2px solid var(--gold)", outlineOffset: 2 } : undefined}>
      {isCurrent && <div className={styles.currentRibbon}>Current plan</div>}
      <div>
        <div className={styles.tierName}>{tier.name}</div>
        <p className={styles.tierDesc}>{tier.desc}</p>
      </div>

      {showIntervalPicker && !tier.applyOnly && availableIntervals.length > 1 && (
        <div className={styles.intervalRow}>
          {availableIntervals.map((i) => (
            <button
              key={i}
              type="button"
              className={selectedInterval === i ? styles.intervalPillActive : styles.intervalPill}
              onClick={() => onSelectInterval(i)}
            >
              {INTERVAL_LABEL[i]}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className={styles.tierPrice}>
          {tier.applyOnly ? "Custom" : (formatPrice(price?.amount, price?.currency) ?? "—")}
          {!tier.applyOnly && price && price.amount !== 0 && (
            <span className={styles.statLabel} style={{ fontSize: 13 }}>
              {" "}
              / {INTERVAL_LABEL[effectiveInterval]}
            </span>
          )}
        </div>
        {!tier.applyOnly && effectiveInterval !== "monthly" && price?.amount ? (
          <div className={styles.tierPriceSub}>
            {formatPrice(Math.round(price.amount / INTERVAL_MONTHS[effectiveInterval]), price.currency)}/mo
            {savePct != null && savePct > 0 && <> · <span className={styles.saveBadge}>save {savePct}%</span></>}
          </div>
        ) : null}
      </div>

      {tier.yearlyBonuses && effectiveInterval === "yearly" && (
        <div className={styles.bonusBlock}>
          <div className={styles.bonusHeading}>Bonuses on Yearly Membership:</div>
          <ul className={styles.featureList} style={{ flex: "none", gap: 4 }}>
            {tier.yearlyBonuses.map((b) => (
              <li key={b} className={styles.featureItem}>
                <span className={styles.featureCheck}>✓</span> {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {action}

      <div className={styles.divider} />

      <div style={{ flex: 1 }}>
        <ul className={styles.featureList} style={{ flex: "none" }}>
          {visibleFeatures.map((f) => (
            <li key={f} className={styles.featureItem}>
              <span className={styles.featureCheck}>✓</span> {f}
            </li>
          ))}
        </ul>
        {tier.features.length > collapseAt && (
          <button type="button" className={styles.featureToggle} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show ${tier.features.length - collapseAt} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// The Change Plan picker's shared Monthly/Yearly switch, shown once
// above the whole card grid instead of a per-card picker (existing
// students upgrading/downgrading only ever choose between those two —
// the 3-month/6-month intervals stay promotional-checkout-only, on the
// public pricing page's per-card picker).
export function IntervalToggle({
  value,
  onChange,
}: {
  value: "monthly" | "yearly";
  onChange: (value: "monthly" | "yearly") => void;
}) {
  return (
    <div className={styles.globalToggle}>
      <button
        type="button"
        className={value === "monthly" ? styles.globalToggleOptionActive : styles.globalToggleOption}
        onClick={() => onChange("monthly")}
      >
        Monthly
      </button>
      <button
        type="button"
        className={value === "yearly" ? styles.globalToggleOptionActive : styles.globalToggleOption}
        onClick={() => onChange("yearly")}
      >
        Yearly
      </button>
    </div>
  );
}
