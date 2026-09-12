"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../billing.module.css";

type Step = "email" | "code";

const RESEND_COOLDOWN_S = 60;

// Billing-site login — same email → code → session shape as the main
// app's LoginForm (app/login/login-form.tsx), posting to the billing-
// scoped routes instead. No iframe storage-access dance here (this site
// is never embedded, always a real top-level tab/window).
export default function BillingLoginForm({ next }: { next?: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [justResent, setJustResent] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function sendCode(targetEmail: string): Promise<{ ok: boolean; error?: string; noAccount?: boolean }> {
    try {
      const res = await fetch("/api/billing/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { ok: false, error: data?.message ?? data?.error ?? "Something went wrong — try again.", noAccount: data?.error === "no_account" };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Something went wrong — try again." };
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    setNoAccount(false);
    const result = await sendCode(email.trim());
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong — try again.");
      setNoAccount(!!result.noAccount);
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_S);
    setStep("code");
  }

  async function handleResend() {
    if (resendCooldown > 0 || sending) return;
    setSending(true);
    setError(null);
    setJustResent(false);
    const result = await sendCode(email.trim());
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong — try again.");
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_S);
    setJustResent(true);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setVerifying(true);
    setError(null);
    const res = await fetch("/api/billing/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), code: code.trim(), next }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.redirectUrl) {
      window.location.href = data.redirectUrl;
      return;
    }
    setVerifying(false);
    setError(data?.error ?? "Something went wrong — try again.");
  }

  if (step === "email") {
    return (
      <form className={styles.form} onSubmit={handleSendCode}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={styles.input}
        />
        {error && (
          <p className={styles.errorText}>
            {error} {noAccount && <Link href="/billing" className={styles.linkBtn}>See plans</Link>}
          </p>
        )}
        <button type="submit" disabled={sending} className={styles.cta}>
          {sending ? "Sending…" : "Send me a code"}
        </button>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleVerify}>
      <p className={styles.helpText} style={{ margin: 0 }}>
        We sent a code to <strong>{email}</strong> — enter it below.
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        required
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="000000"
        className={`${styles.input} ${styles.codeInput}`}
      />
      {error && <p className={styles.errorText}>{error}</p>}
      {justResent && !error && <p className={styles.successText}>Code resent — check your email.</p>}
      <button type="submit" disabled={verifying || code.length !== 6} className={styles.cta}>
        {verifying ? "Verifying…" : "Verify"}
      </button>
      <button type="button" className={styles.linkBtn} disabled={sending || resendCooldown > 0} onClick={handleResend}>
        {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : sending ? "Resending…" : "Resend code"}
      </button>
      <button
        type="button"
        className={styles.linkBtn}
        disabled={sending}
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
          setJustResent(false);
          setResendCooldown(0);
        }}
      >
        Use a different email
      </button>
    </form>
  );
}
