"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/stripe/tiers";
import styles from "../billing.module.css";

interface AddonRow {
  id: string;
  label: string;
  active: boolean;
  canAdd: boolean;
  canRemove: boolean;
  amount: number | null;
  currency: string | null;
  interval: string | null;
}

// Shown whenever the student's current tier has any add-ons in the
// catalog (lib/billing/addons.ts) — e.g. Suite's biweekly lessons, Pro's
// 60-min lessons. Self-serve/instant, same posture as Change Plan: each
// toggle hits Stripe right away (a second subscription item on the same
// subscription), no admin approval. Renders nothing for a tier with no
// add-ons (lite/elite today) or while there's nothing to show yet.
//
// A legacy (Opus-account) student can already have one of these active
// (see /api/billing/addons's own comment) — canRemove stays true either
// way, but canAdd is false once they're not on "own" yet, since a brand
// new item can only be created against the current account's Price.
export default function AddonsClient() {
  const [addons, setAddons] = useState<AddonRow[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/billing/addons");
      const data = await res.json().catch(() => null);
      if (res.ok) setAddons(data?.addons ?? []);
    } catch {
      // Stay silent — this is a secondary section, not worth a hard error
      // banner if it just can't load once.
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(addon: AddonRow) {
    setPendingId(addon.id);
    setError(null);
    const res = await fetch("/api/billing/addons/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addonId: addon.id, action: addon.active ? "remove" : "add" }),
    });
    const data = await res.json().catch(() => null);
    setPendingId(null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't update that add-on.");
      return;
    }
    await load();
  }

  if (!addons || addons.length === 0) return null;

  return (
    <div className={styles.card} style={{ maxWidth: 480, marginBottom: 24, textAlign: "left" }}>
      <div className={styles.tierName} style={{ marginBottom: 12 }}>
        Add-ons
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
      {addons.map((addon) => {
        const canToggle = addon.active ? addon.canRemove : addon.canAdd;
        const label = pendingId === addon.id ? "…" : addon.active ? "Remove" : addon.canAdd ? "Add" : addon.amount == null ? "Coming soon" : "Migrate first";

        return (
          <div key={addon.id} className={styles.statRow}>
            <span className={styles.statLabel}>
              {addon.label}
              {addon.amount != null && (
                <>
                  {" — "}
                  {formatPrice(addon.amount, addon.currency) ?? "—"}
                  {addon.interval ? ` / ${addon.interval}` : ""}
                </>
              )}
            </span>
            <button
              type="button"
              className={addon.active ? styles.linkBtn : styles.cta}
              disabled={!canToggle || pendingId === addon.id}
              onClick={() => toggle(addon)}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
