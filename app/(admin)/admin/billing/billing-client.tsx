"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../../admin.module.css";
import type { PaymentStatus, SubscriptionStatus, Tier } from "@/types/database";

interface BillingStudent {
  id: string;
  name: string;
  tier: Tier;
  subscription_status: SubscriptionStatus;
  payment_status: PaymentStatus;
  billing_anniversary_date: string | null;
  stripe_customer_id: string;
  stripe_price_id: string | null;
}

// Stripe-billed students only — a plain table plus two per-row actions
// that lean on Stripe's own dashboard/portal rather than rebuilding
// invoice/payment-method detail here. Cancellations themselves are
// surfaced via the existing Needs Review queue (linked below), which
// already carries cancel_request items from every source.
export default function BillingClient({ students }: { students: BillingStudent[] }) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentLink, setSentLink] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function sendPortalLink(studentId: string) {
    setSendingId(studentId);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/portal-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Couldn't create a billing portal link.");
        setSendingId(null);
        return;
      }
      setSentLink((prev) => ({ ...prev, [studentId]: data.url }));
    } catch {
      setError("Couldn't create a billing portal link.");
    }
    setSendingId(null);
  }

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <Link href="/admin/needs-review" className={styles.linkBtnSmall}>
          View cancellations in Needs Review →
        </Link>
      </p>
      {error && <p className={styles.errorText}>{error}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Student</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Payment</th>
            <th>Renews</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id}>
              <td>
                <Link href={`/admin/students/${s.id}`}>{s.name}</Link>
              </td>
              <td>{s.tier}</td>
              <td>{s.subscription_status}</td>
              <td>{s.payment_status === "dnc" ? "⚠️ DNC" : "OK"}</td>
              <td>{s.billing_anniversary_date ?? "—"}</td>
              <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a
                  href={`https://dashboard.stripe.com/customers/${s.stripe_customer_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkBtnSmall}
                >
                  Open in Stripe
                </a>
                {sentLink[s.id] ? (
                  <a href={sentLink[s.id]} target="_blank" rel="noopener noreferrer" className={styles.linkBtnSmall}>
                    Copy/open portal link
                  </a>
                ) : (
                  <button
                    className={styles.linkBtnSmall}
                    disabled={sendingId === s.id}
                    onClick={() => sendPortalLink(s.id)}
                  >
                    {sendingId === s.id ? "…" : "Get portal link"}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {students.length === 0 && (
            <tr>
              <td colSpan={6}>No Stripe-billed students yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
