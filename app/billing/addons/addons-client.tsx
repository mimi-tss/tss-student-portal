"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/stripe/tiers";
import styles from "../billing.module.css";

interface AddonRowBase {
  id: string;
  label: string;
  description: string | null;
  amount: number | null;
  currency: string | null;
  interval: string | null;
}

interface RecurringAddonRow extends AddonRowBase {
  kind: "recurring";
  active: boolean;
  canAdd: boolean;
  canRemove: boolean;
}

interface OneTimeAddonRow extends AddonRowBase {
  kind: "one_time";
  canPurchase: boolean;
}

type AddonRow = RecurringAddonRow | OneTimeAddonRow;

// The one place an add-on actually gets added/removed/bought — its own
// page (not a section of /billing/account) specifically so the studio
// can share this link directly (e.g. a promo for Suite's biweekly-
// lessons add-on) without routing someone through the whole account page
// first. /billing/account only ever shows a read-only summary of what's
// already active and links back here to manage.
//
// Laid out like the tier-card grid (tier-card.tsx) — one box per add-on,
// title+price bold up top, the action button pinned to the bottom via
// the box's own flex-column + margin-top: auto, three per row
// (.addonGrid, billing.module.css).
//
// Two very different shapes render here (see lib/billing/addons.ts):
// "recurring" is Add/Remove, toggling a subscription item. "one_time" is
// Buy — a straight off-session charge, repeatable by design, with an
// inline "Confirm — $X" step first since there's no undo on a completed
// charge the way removing a subscription item has.
export default function AddonsClient() {
  const [addons, setAddons] = useState<AddonRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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

  async function toggleRecurring(addon: RecurringAddonRow) {
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

  async function purchase(addonId: string) {
    setPendingId(addonId);
    setError(null);
    const res = await fetch("/api/billing/addons/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addonId }),
    });
    const data = await res.json().catch(() => null);
    setPendingId(null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't complete that purchase.");
      return;
    }
    setConfirmingId(null);
    await load();
  }

  if (loading) {
    return (
      <p className={styles.helpText} style={{ margin: 0 }}>
        Loading your add-ons…
      </p>
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
    <div>
      {error && <p className={styles.errorText}>{error}</p>}
      <div className={styles.addonGrid}>
        {addons.map((addon) => {
          const titleLine = (
            <div style={{ fontWeight: 700 }}>
              {addon.label}
              {addon.amount != null && (
                <>
                  {" — "}
                  {formatPrice(addon.amount, addon.currency) ?? "—"}
                  {addon.interval ? ` / ${addon.interval}` : ""}
                </>
              )}
            </div>
          );

          if (addon.kind === "recurring") {
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
              <div key={addon.id} className={styles.tierCard} style={{ textAlign: "center", alignItems: "center" }}>
                {titleLine}
                {addon.description && (
                  <p className={styles.tierDesc} style={{ margin: 0 }}>
                    {addon.description}
                  </p>
                )}
                <div style={{ marginTop: "auto" }}>
                  <button
                    type="button"
                    className={addon.active ? styles.linkBtn : styles.cta}
                    disabled={!canToggle || pendingId === addon.id}
                    onClick={() => toggleRecurring(addon)}
                  >
                    {label}
                  </button>
                </div>
              </div>
            );
          }

          // one_time
          const isConfirming = confirmingId === addon.id;

          return (
            <div key={addon.id} className={styles.tierCard} style={{ textAlign: "center", alignItems: "center" }}>
              {titleLine}
              {addon.description && (
                <p className={styles.tierDesc} style={{ margin: 0 }}>
                  {addon.description}
                </p>
              )}

              <div style={{ marginTop: "auto" }}>
                {isConfirming ? (
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button type="button" className={styles.linkBtn} disabled={pendingId === addon.id} onClick={() => setConfirmingId(null)}>
                      Never mind
                    </button>
                    <button type="button" className={styles.cta} disabled={pendingId === addon.id} onClick={() => purchase(addon.id)}>
                      {pendingId === addon.id ? "Charging…" : `Confirm — ${formatPrice(addon.amount, addon.currency) ?? "buy"}`}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.cta}
                    disabled={!addon.canPurchase || pendingId === addon.id}
                    onClick={() => setConfirmingId(addon.id)}
                  >
                    {!addon.canPurchase ? "Coming soon" : "Buy"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Link href="/billing/account" className={styles.linkBtn} style={{ marginTop: 16, display: "inline-block" }}>
        ← Back to your account
      </Link>
    </div>
  );
}
