"use client";

import { useState } from "react";
import styles from "../billing.module.css";

// Everything upgrade/downgrade/cancel/card-swap lives on Stripe's own
// hosted Billing Portal — nothing custom to build here beyond minting the
// one-time session URL and redirecting into it.
export default function AccountClient({ hasStripeAccount }: { hasStripeAccount: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manageBilling() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Couldn't open the billing portal — try again.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't open the billing portal — try again.");
      setLoading(false);
    }
  }

  if (!hasStripeAccount) {
    return <p className={styles.helpText}>Billing management isn&apos;t available for this account yet — contact the studio.</p>;
  }

  return (
    <div>
      {error && <p className={styles.errorText}>{error}</p>}
      <button className={styles.cta} disabled={loading} onClick={manageBilling}>
        {loading ? "Opening…" : "Manage billing"}
      </button>
    </div>
  );
}
