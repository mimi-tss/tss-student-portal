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
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier | "">("");
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | "">("");

  const filtered = students
    .filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((s) => !tierFilter || s.tier === tierFilter)
    .filter((s) => !statusFilter || s.subscription_status === statusFilter);

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
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search students by name…"
          className={styles.searchInput}
          style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as Tier | "")}
          className={styles.select}
        >
          <option value="">All tiers</option>
          <option value="lite">Lite</option>
          <option value="pro">Pro</option>
          <option value="suite">Suite</option>
          <option value="elite">Elite</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SubscriptionStatus | "")}
          className={styles.select}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className={styles.mutedText}>
          {filtered.length} of {students.length} student{students.length === 1 ? "" : "s"}
        </span>
      </div>
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
          {filtered.map((s) => (
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
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6}>{students.length === 0 ? "No Stripe-billed students yet." : "No students match that filter."}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
