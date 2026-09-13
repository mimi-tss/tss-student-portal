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
  requiresGroupLessonSpot: boolean;
}

type AddonRow = RecurringAddonRow | OneTimeAddonRow;

interface DropInSpot {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  coachName: string;
  spotsLeft: number | null;
}

function formatSpotDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// The one place an add-on actually gets added/removed/bought — its own
// page (not a section of /billing/account) specifically so the studio
// can share this link directly (e.g. a promo for Suite's biweekly-
// lessons add-on) without routing someone through the whole account page
// first. /billing/account only ever shows a read-only summary of what's
// already active and links back here to manage.
//
// Two very different shapes render here (see lib/billing/addons.ts):
// "recurring" is Add/Remove, toggling a subscription item. "one_time" is
// Buy — a straight off-session charge, repeatable by design, with an
// inline "Confirm — $X" step first since there's no undo on a completed
// charge the way removing a subscription item has. Drop-In additionally
// needs a specific group-lesson spot picked first (real capacity, not
// just a price) — see /api/billing/addons/drop-in-spots.
export default function AddonsClient() {
  const [addons, setAddons] = useState<AddonRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [spotPickerFor, setSpotPickerFor] = useState<string | null>(null);
  const [spots, setSpots] = useState<DropInSpot[] | null>(null);
  const [spotsLoading, setSpotsLoading] = useState(false);

  // Coupons are real Stripe Promotion Codes (managed in the Dashboard,
  // not this app) — a student just types the code they were given.
  // Keyed per add-on so entering one doesn't leak into another row.
  const [couponByAddonId, setCouponByAddonId] = useState<Record<string, string>>({});

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
      body: JSON.stringify({
        addonId: addon.id,
        action: addon.active ? "remove" : "add",
        couponCode: couponByAddonId[addon.id],
      }),
    });
    const data = await res.json().catch(() => null);
    setPendingId(null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't update that add-on.");
      return;
    }
    await load();
  }

  async function purchase(addonId: string, groupLessonId?: string) {
    setPendingId(addonId);
    setError(null);
    const res = await fetch("/api/billing/addons/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addonId, groupLessonId, couponCode: couponByAddonId[addonId] }),
    });
    const data = await res.json().catch(() => null);
    setPendingId(null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't complete that purchase.");
      return;
    }
    setConfirmingId(null);
    setSpotPickerFor(null);
    setSpots(null);
    await load();
  }

  async function openSpotPicker(addonId: string) {
    setSpotPickerFor(addonId);
    setSpots(null);
    setSpotsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/addons/drop-in-spots");
      const data = await res.json().catch(() => null);
      if (res.ok) setSpots(data?.spots ?? []);
      else setError(data?.error ?? "Couldn't load open spots.");
    } catch {
      setError("Couldn't load open spots.");
    }
    setSpotsLoading(false);
  }

  function couponField(addonId: string) {
    return (
      <input
        type="text"
        placeholder="Coupon code (optional)"
        value={couponByAddonId[addonId] ?? ""}
        onChange={(e) => setCouponByAddonId((c) => ({ ...c, [addonId]: e.target.value }))}
        className={styles.input}
        style={{ maxWidth: 180, padding: "4px 8px", fontSize: 13 }}
      />
    );
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
        const priceLabel = addon.amount != null && (
          <>
            {" — "}
            {formatPrice(addon.amount, addon.currency) ?? "—"}
            {addon.interval ? ` / ${addon.interval}` : ""}
          </>
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
            <div key={addon.id} className={styles.statRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <span className={styles.statLabel}>
                  {addon.label}
                  {priceLabel}
                </span>
                <button
                  type="button"
                  className={addon.active ? styles.linkBtn : styles.cta}
                  disabled={!canToggle || pendingId === addon.id}
                  onClick={() => toggleRecurring(addon)}
                >
                  {label}
                </button>
              </div>
              {addon.description && (
                <span className={styles.helpText} style={{ margin: 0 }}>
                  {addon.description}
                </span>
              )}
              {!addon.active && addon.canAdd && couponField(addon.id)}
            </div>
          );
        }

        // one_time
        const isConfirming = confirmingId === addon.id;
        const isPicking = spotPickerFor === addon.id;

        return (
          <div key={addon.id} className={styles.statRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <span className={styles.statLabel}>
                {addon.label}
                {priceLabel}
              </span>
              {addon.requiresGroupLessonSpot ? (
                <button
                  type="button"
                  className={styles.cta}
                  disabled={!addon.canPurchase || pendingId === addon.id}
                  onClick={() => (isPicking ? setSpotPickerFor(null) : openSpotPicker(addon.id))}
                >
                  {!addon.canPurchase ? "Coming soon" : isPicking ? "Close" : "Choose a spot"}
                </button>
              ) : isConfirming ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {couponField(addon.id)}
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
            {addon.description && (
              <span className={styles.helpText} style={{ margin: 0 }}>
                {addon.description}
              </span>
            )}

            {isPicking && (
              <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
                <div style={{ marginBottom: 8 }}>{couponField(addon.id)}</div>
                {spotsLoading && (
                  <p className={styles.helpText} style={{ margin: 0 }}>
                    Loading open classes…
                  </p>
                )}
                {!spotsLoading && spots?.length === 0 && (
                  <p className={styles.helpText} style={{ margin: 0 }}>
                    No open spots right now — check back soon.
                  </p>
                )}
                {!spotsLoading &&
                  spots?.map((spot) => (
                    <div key={spot.id} className={styles.statRow}>
                      <span className={styles.statLabel}>
                        {spot.topic || "Group class"} — {formatSpotDate(spot.scheduledAt)}
                        {spot.spotsLeft != null && ` (${spot.spotsLeft} left)`}
                      </span>
                      <button
                        type="button"
                        className={styles.cta}
                        disabled={pendingId === addon.id}
                        onClick={() => purchase(addon.id, spot.id)}
                      >
                        {pendingId === addon.id ? "Charging…" : "Buy this spot"}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
      <Link href="/billing/account" className={styles.linkBtn} style={{ marginTop: 16, display: "inline-block" }}>
        ← Back to your account
      </Link>
    </div>
  );
}
