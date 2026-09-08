"use client";

import { useState } from "react";
import styles from "./billing.module.css";
import type { Tier } from "@/types/database";

const TIERS: { tier: Tier; name: string; desc: string }[] = [
  { tier: "lite", name: "Lite", desc: "Course access and community — no 1:1 coaching portal." },
  { tier: "suite", name: "Suite", desc: "Weekly 1:1 lessons plus everything in Lite." },
  { tier: "pro", name: "Pro", desc: "More frequent coaching and priority scheduling." },
  { tier: "elite", name: "Elite", desc: "Our most comprehensive coaching plan." },
];

export default function PricingClient() {
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(tier: Tier) {
    setLoadingTier(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Couldn't start checkout — try again.");
        setLoadingTier(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't start checkout — try again.");
      setLoadingTier(null);
    }
  }

  return (
    <div>
      {error && <p className={styles.errorText}>{error}</p>}
      <div className={styles.tierGrid}>
        {TIERS.map((t) => (
          <div key={t.tier} className={styles.tierCard}>
            <div className={styles.tierName}>{t.name}</div>
            <p className={styles.tierDesc}>{t.desc}</p>
            <button className={styles.cta} disabled={loadingTier !== null} onClick={() => choose(t.tier)}>
              {loadingTier === t.tier ? "Starting…" : `Choose ${t.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
