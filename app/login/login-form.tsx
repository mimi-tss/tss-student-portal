"use client";

import { useEffect, useState } from "react";
import styles from "./login.module.css";

type Step = "email" | "code";

const RESEND_COOLDOWN_S = 60;

// Requests permission to use this site's own cookies even while
// embedded in another site's iframe — Kajabi frames this portal
// directly (app.tarasimonstudios.com inside portal.tarasimonstudios.com),
// and confirmed live this is exactly what broke login for students
// entering it that way: the code verified correctly every single time
// (login_codes.used_at proved it), but the resulting session cookie
// never actually stuck in the browser, bouncing them back to enter a
// fresh code forever. Safari blocks third-party/cross-site cookies by
// default regardless of how the cookie is set (header or JS); Chrome
// is moving the same direction. The Storage Access API is the
// standards-track fix for exactly this — an embedded page asking the
// browser to treat its own storage as first-party — and it must be
// called from a real user gesture (a click), which is why this is
// awaited at the top of both submit handlers below, not on page load.
// A total no-op when not iframed (top-level browsing already has
// storage access) or on a browser that doesn't support the API at all.
async function ensureStorageAccess() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.self === window.top) return;
  if (typeof document.requestStorageAccess !== "function") return;

  try {
    const alreadyHasAccess =
      typeof document.hasStorageAccess === "function" ? await document.hasStorageAccess() : false;
    if (!alreadyHasAccess) {
      await document.requestStorageAccess();
    }
  } catch {
    // Denied, unsupported in this exact context, or errored — the
    // login attempt right after this proceeds exactly as it would
    // have without ever trying, so there's nothing to recover here.
  }
}

export default function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [justResent, setJustResent] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function sendCode(targetEmail: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/auth/request-login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { ok: false, error: data?.error ?? "Something went wrong — try again." };
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
    await ensureStorageAccess();
    const result = await sendCode(email.trim());
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong — try again.");
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
    await ensureStorageAccess();
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
    // The last chance to grab storage access before the session cookie
    // this request sets actually needs to stick — handleSendCode's own
    // earlier call already covers most cases, but repeating it here
    // (same click-driven requirement) means a code re-entered fresh
    // still gets the same protection.
    await ensureStorageAccess();
    const res = await fetch("/api/auth/verify-login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), code: code.trim() }),
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
        {error && <p className={styles.errorText}>{error}</p>}
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
