"use client";

import { useEffect, useState } from "react";
import { STATUS_LABEL, type BillingDisplayStatus } from "@/lib/stripe/status";
import { TIER_LABEL, formatPrice } from "@/lib/stripe/tiers";
import type { Tier, StripeAccount } from "@/types/database";
import PaymentMethodClient from "./payment-method-client";
import ChangePlanClient from "./change-plan-client";
import styles from "../billing.module.css";

interface SubscriptionDetail {
  linked: boolean;
  studentName?: string | null;
  planName?: string | null;
  tier?: Tier | null;
  stripeAccount?: StripeAccount | null;
  status?: BillingDisplayStatus;
  amount?: number | null;
  currency?: string | null;
  interval?: string | null;
  nextChargeAt?: string | null;
  pauseResumesAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  card?: { brand: string; last4: string } | null;
  paymentMethodType?: string | null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Live subscription detail — see app/api/billing/subscription/route.ts's
// own header comment on why this isn't read from the local `students`
// mirror. Pause/Cancel/Change-Plan are all request-only here — none of
// them touch Stripe directly. Each just creates a student_requests row
// that alerts admin (Needs Review + Slack); admin approving one is what
// actually executes it in Stripe (see lib/admin/attention-items.ts).
// Update payment method is the one action that still happens instantly
// — it's not a subscription-state change, just a stored card.
export default function SubscriptionClient() {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [submittingPause, setSubmittingPause] = useState(false);
  const [resumeDate, setResumeDate] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [showPauseForm, setShowPauseForm] = useState(false);

  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);

  const [showChangePlanForm, setShowChangePlanForm] = useState(false);

  const [showCardForm, setShowCardForm] = useState(false);

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

  async function submitPause(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeDate || !pauseReason.trim()) return;
    setSubmittingPause(true);
    setError(null);
    const res = await fetch("/api/billing/request-pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeDate, reason: pauseReason }),
    });
    const data = await res.json().catch(() => null);
    setSubmittingPause(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't submit your pause request.");
      return;
    }
    setShowPauseForm(false);
    setResumeDate("");
    setPauseReason("");
    setConfirmation("Pause request sent — the studio will follow up before anything changes.");
  }

  async function submitCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelReason.trim()) return;
    setSubmittingCancel(true);
    setError(null);
    const res = await fetch("/api/billing/request-cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason }),
    });
    const data = await res.json().catch(() => null);
    setSubmittingCancel(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't submit your cancellation request.");
      return;
    }
    setShowCancelForm(false);
    setCancelReason("");
    setConfirmation("Cancellation request sent — the studio will reach out before it's final.");
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
        {error ? (
          // A real server error (e.g. a Stripe API failure) looked
          // IDENTICAL to a genuine "not linked" response here before this
          // fix — both left `detail` null, and this branch only ever
          // showed the generic "couldn't find" copy regardless of which
          // one actually happened, masking real failures during setup.
          <p className={styles.errorText} style={{ margin: 0 }}>
            {error}
          </p>
        ) : (
          <p className={styles.helpText} style={{ margin: 0 }}>
            We couldn&apos;t find a billing account for you yet — contact the studio.
          </p>
        )}
      </div>
    );
  }

  const isActionable = detail.status !== "canceled";

  return (
    <div style={{ marginBottom: 24 }}>
      <div className={styles.card} style={{ maxWidth: 480, margin: "0 0 16px", textAlign: "left" }}>
        {detail.studentName && (
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Student</span>
            <span>{detail.studentName}</span>
          </div>
        )}
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Plan</span>
          <span className={styles.badge}>{detail.planName ?? (detail.tier ? TIER_LABEL[detail.tier] : "—")}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Status</span>
          <span className={styles.badge}>{detail.status ? STATUS_LABEL[detail.status] : "—"}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Amount</span>
          <span>
            {formatPrice(detail.amount, detail.currency) ?? "—"}
            {detail.interval ? ` / ${detail.interval}` : ""}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>{detail.status === "paused" ? "Resumes" : "Next charge"}</span>
          <span>{formatDate(detail.status === "paused" ? detail.pauseResumesAt : detail.nextChargeAt) ?? "—"}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Payment method</span>
          <span>
            {detail.card
              ? `${detail.card.brand.toUpperCase()} •••• ${detail.card.last4}`
              : detail.paymentMethodType === "link"
                ? "Link"
                : "—"}
          </span>
        </div>
        {detail.cancelAtPeriodEnd && detail.status !== "canceled" && (
          <p className={styles.errorText} style={{ marginTop: 12 }}>
            This plan is set to cancel at the end of the current period.
          </p>
        )}
      </div>

      {confirmation && <p className={styles.successText} style={{ marginTop: 0 }}>{confirmation}</p>}
      {error && <p className={styles.errorText}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button className={styles.cta} onClick={() => setShowCardForm((v) => !v)}>
          {showCardForm ? "Close" : "Update payment method"}
        </button>
        {isActionable && (
          <button className={styles.cta} onClick={() => setShowChangePlanForm((v) => !v)}>
            {showChangePlanForm ? "Close" : "Change plan"}
          </button>
        )}
        {isActionable && (
          <button className={styles.cta} onClick={() => setShowPauseForm((v) => !v)}>
            {showPauseForm ? "Close" : "Request to pause"}
          </button>
        )}
        {isActionable && (
          <button className={styles.cta} onClick={() => setShowCancelForm((v) => !v)}>
            {showCancelForm ? "Never mind" : "Cancel"}
          </button>
        )}
      </div>

      {showCancelForm && (
        <form onSubmit={submitCancel} className={`${styles.card} ${styles.form}`} style={{ maxWidth: 480, marginBottom: 16 }}>
          <p className={styles.helpText} style={{ margin: 0 }}>
            We&apos;re sorry to see you go — tell us why, and the studio will follow up before this is final.
          </p>
          <label className={styles.statLabel} htmlFor="cancelReason">
            Reason
          </label>
          <textarea
            id="cancelReason"
            required
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.cta} disabled={submittingCancel}>
            {submittingCancel ? "Sending…" : "Send cancellation request"}
          </button>
        </form>
      )}

      {showPauseForm && (
        <form onSubmit={submitPause} className={`${styles.card} ${styles.form}`} style={{ maxWidth: 480, marginBottom: 16 }}>
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
          <label className={styles.statLabel} htmlFor="pauseReason">
            Reason
          </label>
          <textarea
            id="pauseReason"
            required
            rows={3}
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.cta} disabled={submittingPause}>
            {submittingPause ? "Sending…" : "Send pause request"}
          </button>
        </form>
      )}

      {showChangePlanForm && (
        <div style={{ marginBottom: 16 }}>
          <ChangePlanClient
            currentTier={detail.tier}
            stripeAccount={detail.stripeAccount}
            onDone={(message) => {
              setShowChangePlanForm(false);
              setConfirmation(message ?? "Plan changed.");
              load();
            }}
          />
        </div>
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
