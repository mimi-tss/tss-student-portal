"use client";

import { useState } from "react";
import styles from "./login.module.css";

type Step = "email" | "code";

export default function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    await fetch("/api/auth/request-login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => {});
    setSending(false);
    setStep("code");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setVerifying(true);
    setError(null);
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
      <button type="submit" disabled={verifying || code.length !== 6} className={styles.cta}>
        {verifying ? "Verifying…" : "Verify"}
      </button>
      <button
        type="button"
        className={styles.linkBtn}
        disabled={sending}
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
      >
        Use a different email
      </button>
    </form>
  );
}
