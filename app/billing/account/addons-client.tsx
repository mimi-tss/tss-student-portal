"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/stripe/tiers";
import styles from "../billing.module.css";

interface AddonRow {
  id: string;
  label: string;
  kind: "recurring" | "one_time";
  active?: boolean;
  amount: number | null;
  currency: string | null;
  interval: string | null;
}

// Read-only — purchasing/removing/buying an add-on happens on its own
// page (/billing/addons, deliberately separate so the studio can share
// that link directly). This just folds whatever's currently ACTIVE into
// the account page's billing info, plus a "Manage" link over to the real
// page. Only "recurring" add-ons have an ongoing active state to show —
// "one_time" purchases (4-Pack, Drop-In, Spotlight, etc.) are
// deliberately not tracked anywhere beyond a Slack ping (confirmed with
// the user), so there's nothing to list here for those; they only ever
// show up as a line item on the student's real Stripe billing history.
// Renders nothing at all for a tier with no add-ons in the catalog
// (lite today).
export default function AddonsClient() {
  const [addons, setAddons] = useState<AddonRow[] | null>(null);

  useEffect(() => {
    fetch("/api/billing/addons")
      .then((res) => res.json())
      .then((data) => setAddons(data?.addons ?? []))
      .catch(() => setAddons([]));
  }, []);

  if (!addons || addons.length === 0) return null;
  const active = addons.filter((a) => a.kind === "recurring" && a.active);

  return (
    <div className={styles.card} style={{ maxWidth: 480, marginBottom: 24, textAlign: "left" }}>
      <div className={styles.tierName} style={{ marginBottom: 12 }}>
        Add-ons
      </div>
      {active.length > 0 ? (
        active.map((addon) => (
          <div key={addon.id} className={styles.statRow}>
            <span className={styles.statLabel}>{addon.label}</span>
            <span>
              {formatPrice(addon.amount, addon.currency) ?? "—"}
              {addon.interval ? ` / ${addon.interval}` : ""}
            </span>
          </div>
        ))
      ) : (
        <p className={styles.helpText} style={{ margin: 0 }}>
          None active.
        </p>
      )}
      <Link href="/billing/addons" className={styles.linkBtn} style={{ marginTop: 12, display: "inline-block" }}>
        Manage add-ons
      </Link>
    </div>
  );
}
