"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatPrice, type BillingInterval } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";
import styles from "../billing.module.css";

interface AddonRow {
  id: string;
  label: string;
  description: string | null;
  kind: "recurring" | "one_time";
  amount: number | null;
  currency: string | null;
  interval: string | null;
  available: boolean;
}

// Which add-ons this pre-checkout step offers, and in what order — a
// deliberate subset of whatever /api/billing/addons/catalog returns for
// the tier, not the whole catalog (studio's call, 2026-09-14: only
// these two on the Suite funnel's step 2, not all four Suite-eligible
// add-ons). Extend this list (or key it by tier) if another funnel
// wants a different subset later.
const SHOWN_ADDON_IDS = ["biweekly_30min_suite", "four_pack_group_class"];

export default function AddonsSelectClient() {
  const searchParams = useSearchParams();
  const tier = searchParams.get("tier") as Tier | null;
  const interval = (searchParams.get("interval") ?? "monthly") as BillingInterval;

  const [addons, setAddons] = useState<AddonRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tier) {
      setLoading(false);
      return;
    }
    fetch(`/api/billing/addons/catalog?tier=${encodeURIComponent(tier)}`)
      .then((res) => res.json())
      .then((data) => {
        const rows: AddonRow[] = data?.addons ?? [];
        const ordered = SHOWN_ADDON_IDS.map((id) => rows.find((a) => a.id === id)).filter(
          (a): a is AddonRow => !!a,
        );
        setAddons(ordered);
      })
      .catch(() => setAddons([]))
      .finally(() => setLoading(false));
  }, [tier]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function continueToCheckout() {
    if (!tier) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval, addonIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Couldn't start checkout — try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't start checkout — try again.");
      setSubmitting(false);
    }
  }

  if (!tier) {
    return (
      <div className={styles.card} style={{ maxWidth: 480, textAlign: "left" }}>
        <p className={styles.helpText} style={{ margin: 0 }}>
          No plan was specified. Head back and choose a plan first.
        </p>
        <a href="/billing" className={styles.linkBtn} style={{ marginTop: 12, display: "inline-block" }}>
          ← Choose your plan
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <p className={styles.helpText} style={{ margin: 0, textAlign: "center" }}>
        Loading add-ons…
      </p>
    );
  }

  return (
    <div>
      {error && <p className={styles.errorText}>{error}</p>}

      {addons && addons.length > 0 && (
        // This page always shows exactly SHOWN_ADDON_IDS.length cards (2
        // today), so the shared .addonGrid's repeat(3, 1fr) — built for
        // the authenticated add-ons page, which can show up to 5 — left
        // the pair anchored to the left with empty space on the right.
        // justify-content: center on a grid centers its tracks as a
        // block when they don't fill the container, which repeat(3,1fr)
        // never triggers on its own — overridden here rather than in
        // the shared class so the other page's layout is untouched.
        <div
          className={styles.addonGrid}
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 320px))", justifyContent: "center" }}
        >
          {addons.map((addon) => {
            const isSelected = selected.has(addon.id);
            return (
              <div
                key={addon.id}
                className={styles.tierCard}
                style={{
                  textAlign: "center",
                  alignItems: "center",
                  opacity: addon.available ? 1 : 0.6,
                  outline: isSelected ? "2px solid var(--gold)" : undefined,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {addon.label}
                  {addon.amount != null && (
                    <>
                      {" — "}
                      {formatPrice(addon.amount, addon.currency) ?? "—"}
                      {addon.kind === "recurring" ? "/mo" : ""}
                    </>
                  )}
                </div>
                {addon.description && (
                  <p className={styles.tierDesc} style={{ margin: 0 }}>
                    {addon.description}
                  </p>
                )}
                {!addon.available && (
                  <p className={styles.helpText} style={{ margin: 0 }}>
                    Not available right now
                  </p>
                )}
                <div style={{ marginTop: "auto" }}>
                  <button
                    type="button"
                    className={isSelected ? styles.linkBtn : styles.cta}
                    disabled={!addon.available}
                    onClick={() => toggle(addon.id)}
                  >
                    {isSelected ? "Remove" : "Add"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button type="button" className={styles.cta} disabled={submitting} onClick={continueToCheckout}>
          {submitting ? "Starting…" : selected.size > 0 ? "Continue to Checkout" : "Continue Without Add-Ons"}
        </button>
      </div>
    </div>
  );
}
