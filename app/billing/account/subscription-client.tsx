"use client";

import { useEffect, useState } from "react";
import { STATUS_LABEL, type BillingDisplayStatus } from "@/lib/stripe/status";
import PaymentMethodClient from "./payment-method-client";
import styles from "../billing.module.css";

interface SubscriptionDetail {
  linked: boolean;
  status?: BillingDisplayStatus;
  amount?: number | null;
  currency?: string | null;
  interval?: string | null;
  nextChargeAt?: string | null;
  pauseResumesAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  card?: { brand: string; last4: string } | null;
}

function formatAmount(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null || !currency) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Live subscription detail — see app/api/billing/subscription/route.ts's
// own header comment on why this isn't read from the local `students`
// mirror. Also owns pause/cancel/update-card actions and, as a fallback
// for anything not covered here, a link straight to Stripe's own hosted
// Billing Portal.
export default function SubscriptionClient() {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pausing, setPausing] = useState(false);
  const [resumeDate, setResumeDate] = useState("");
  const [showPauseForm, setShowPauseForm] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [showCardForm, setShowCardForm] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't load your subscription.");
        setLoading(false);
        return;
      }
      setDetail(data);
    } catch {
      setError("Couldn't load your subscription.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function pause(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeDate) return;
    setPausing(true);
    setError(null);
    const res = await fetch("/api/billing/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeDate }),
    });
    const data = await res.json().catch(() => null);
    setPausing(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't pause your subscription.");
      return;
    }
    setShowPauseForm(false);
    setResumeDate("");
    await load();
  }

  async function cancel() {
    setCancelling(true);
    setError(null);
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    const data = await res.json().catch(() => null);
    setCancelling(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't cancel your subscription.");
      return;
    }
    setConfirmCancel(false);
    await load();
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Couldn't open the billing portal — try again.");
        setPortalLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't open the billing portal — try again.");
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.card} style={{ maxWidth: 480, margin: "0 0 24px", textAlign: "left" }}>
        <p className={styles.helpText} style={{ margin: 0 }}>
          Loading your plan…
        </p>
      </div>
    );
  }

  if (!detail?.linked) {
    return (
      <div className={styles.card} style={{ maxWidth: 480, margin: "0 0 24px", textAlign: "left" }}>
        <p className={styles.helpText} style={{ margin: 0 }}>
          We couldn&apos;t find a billing account for you yet — contact the studio.
        </p>
      </div>
    );
  }

  const isCancelable = detail.status !== "canceled";

  return (
    <div style={{ marginBottom: 24 }}>
      <div className={styles.card} style={{ maxWidth: 480, margin: "0 0 16px", textAlign: "left" }}>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Status</span>
          <span className={styles.badge}>{detail.status ? STATUS_LABEL[detail.status] : "—"}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Amount</span>
          <span>
            {formatAmount(detail.amount, detail.currency) ?? "—"}
            {detail.interval ? ` / ${detail.interval}` : ""}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>{detail.status === "paused" ? "Resumes" : "Next charge"}</span>
          <span>{formatDate(detail.status === "paused" ? detail.pauseResumesAt : detail.nextChargeAt) ?? "—"}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Payment method</span>
          <span>{detail.card ? `${detail.card.brand.toUpperCase()} •••• ${detail.card.last4}` : "—"}</span>
        </div>
        {detail.cancelAtPeriodEnd && detail.status !== "canceled" && (
          <p className={styles.errorText} style={{ marginTop: 12 }}>
            This plan is set to cancel at the end of the current period.
          </p>
        )}
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button className={styles.cta} onClick={() => setShowCardForm((v) => !v)}>
          {showCardForm ? "Close" : "Update payment method"}
        </button>
        {isCancelable && (
          <button className={styles.cta} onClick={() => setShowPauseForm((v) => !v)}>
            {showPauseForm ? "Close" : "Pause until a date"}
          </button>
        )}
        {isCancelable && !confirmCancel && (
          <button className={styles.linkBtn} onClick={() => setConfirmCancel(true)}>
            Cancel subscription
          </button>
        )}
        <button className={styles.linkBtn} disabled={portalLoading} onClick={openBillingPortal}>
          {portalLoading ? "Opening…" : "Manage everything in Stripe's Billing Portal"}
        </button>
      </div>

      {confirmCancel && (
        <div className={styles.card} style={{ maxWidth: 480, marginBottom: 16, textAlign: "left" }}>
          <p className={styles.helpText} style={{ margin: "0 0 12px" }}>
            Cancel your subscription? You&apos;ll keep access through the end of your current billing period.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className={styles.cta} disabled={cancelling} onClick={cancel}>
              {cancelling ? "Cancelling…" : "Yes, cancel"}
            </button>
            <button className={styles.linkBtn} disabled={cancelling} onClick={() => setConfirmCancel(false)}>
              Never mind
            </button>
          </div>
        </div>
      )}

      {showPauseForm && (
        <form onSubmit={pause} className={`${styles.card} ${styles.form}`} style={{ maxWidth: 480, marginBottom: 16 }}>
          <label className={styles.statLabel} htmlFor="resumeDate">
            Resume billing on
          </label>
          <input
            id="resumeDate"
            type="date"
            required
            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            value={resumeDate}
            onChange={(e) => setResumeDate(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.cta} disabled={pausing}>
            {pausing ? "Pausing…" : "Pause"}
          </button>
        </form>
      )}

      {showCardForm && (
        <PaymentMethodClient
          onDone={() => {
            setShowCardForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}
