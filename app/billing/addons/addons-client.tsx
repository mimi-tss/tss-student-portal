"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

// The one place an add-on actually gets added/removed — its own page
// (not a section of /billing/account) specifically so the studio can
// share this link directly (e.g. a promo for Suite's biweekly-lessons
// add-on) without routing someone through the whole account page first.
// /billing/account only ever shows a read-only summary of what's already
// active (see its own addons-client.tsx) and links back here to manage.
//
// A legacy (Opus-account) student can already have one of these active
// (see /api/billing/addons's own comment) — canRemove stays true either
// way, but canAdd is false once they're not on "own" yet, since a brand
// new item can only be created against the current account's Price.
export default function AddonsClient() {
  const [addons, setAddons] = useState<AddonRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/addons");
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setAddons(data?.addons ?? []);
      } else {
        setError(data?.error ?? "Couldn't load your add-ons.");
      }
    } catch {
      setError("Couldn't load your add-ons.");
    }
    setLoading(false);
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

  if (loading) {
    return (
      <div className={styles.card} style={{ maxWidth: 480, textAlign: "left" }}>
        <p className={styles.helpText} style={{ margin: 0 }}>
          Loading your add-ons…
        </p>
      </div>
    );
  }

  if (!addons || addons.length === 0) {
    return (
      <div className={styles.card} style={{ maxWidth: 480, textAlign: "left" }}>
        <p className={styles.helpText} style={{ margin: 0 }}>
          {error ?? "No add-ons are available for your current plan."}
        </p>
        <Link href="/billing/account" className={styles.linkBtn} style={{ marginTop: 12, display: "inline-block" }}>
          ← Back to your account
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.card} style={{ maxWidth: 480, textAlign: "left" }}>
      {error && <p className={styles.errorText}>{error}</p>}
      {addons.map((addon) => {
        const canToggle = addon.active ? addon.canRemove : addon.canAdd;
        const label =
          pendingId === addon.id
            ? "…"
            : addon.active
              ? "Remove"
              : addon.canAdd
                ? "Add"
                : addon.amount == null
                  ? "Coming soon"
                  : "Migrate first";

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
      <Link href="/billing/account" className={styles.linkBtn} style={{ marginTop: 16, display: "inline-block" }}>
        ← Back to your account
      </Link>
    </div>
  );
}
