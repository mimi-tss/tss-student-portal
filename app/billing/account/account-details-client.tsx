"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../billing.module.css";

export interface AccountDetails {
  name: string;
  email: string;
  phone: string | null;
}

// Name/phone live on `students`, which has no self-UPDATE RLS policy
// (admin-only writes — see lib/billing/student-stripe-link.ts's own
// comment on this) — saving goes through /api/billing/account-details,
// which re-derives the student from the session (resolveBillingStudent)
// before writing with the admin client, same ownership-checked
// privileged-write pattern as request-cancel/request-pause.
//
// Email is display-only here, never editable: it's also the magic-
// link/OTP login identity (lib/auth/login-code.ts), and changing it
// would need its own re-verification step this doesn't build. The
// "Email me a login code" button reuses the billing site's own
// request-code route (same one /billing/login posts to) so a student
// can pick up a fresh code for signing in elsewhere.
export default function AccountDetailsClient({ initial }: { initial: AccountDetails }) {
  const [details, setDetails] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/billing/account-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save your details.");
      return;
    }
    setDetails((d) => ({ ...d, name: name.trim(), phone: phone.trim() || null }));
    setEditing(false);
    setConfirmation("Saved.");
  }

  async function sendLoginCode() {
    setSendingCode(true);
    setCodeError(null);
    setCodeSent(false);
    const res = await fetch("/api/billing/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: details.email }),
    });
    setSendingCode(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setCodeError(data?.message ?? data?.error ?? "Couldn't send a code — try again.");
      return;
    }
    setCodeSent(true);
  }

  return (
    <div className={styles.card} style={{ maxWidth: 480, marginBottom: 24, textAlign: "left" }}>
      <div className={styles.tierName} style={{ marginBottom: 12 }}>
        Account details
      </div>

      {!editing ? (
        <>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Name</span>
            <span>{details.name}</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Phone</span>
            <span>{details.phone || "—"}</span>
          </div>
          {confirmation && (
            <p className={styles.successText} style={{ marginTop: 12 }}>
              {confirmation}
            </p>
          )}
          <button
            className={styles.cta}
            style={{ marginTop: 12 }}
            onClick={() => {
              setEditing(true);
              setConfirmation(null);
            }}
          >
            Edit
          </button>
        </>
      ) : (
        <form className={styles.form} onSubmit={save}>
          <label className={styles.statLabel}>
            Name
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ marginTop: 4, width: "100%" }}
            />
          </label>
          <label className={styles.statLabel}>
            Phone
            <input
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ marginTop: 4, width: "100%" }}
            />
          </label>
          {error && <p className={styles.errorText}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className={styles.cta} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setName(details.name);
                setPhone(details.phone ?? "");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className={styles.divider} style={{ margin: "16px 0" }} />

      <div className={styles.statRow}>
        <span className={styles.statLabel}>Login email</span>
        <span>{details.email}</span>
      </div>
      <button className={styles.cta} style={{ marginTop: 8 }} onClick={sendLoginCode} disabled={sendingCode}>
        {sendingCode ? "Sending…" : "Email me a login code"}
      </button>
      {codeSent && (
        <p className={styles.successText} style={{ marginTop: 8 }}>
          Code sent — check your email.
        </p>
      )}
      {codeError && (
        <p className={styles.errorText} style={{ marginTop: 8 }}>
          {codeError}
        </p>
      )}

      <div className={styles.divider} style={{ margin: "16px 0" }} />

      <Link href="/student/dashboard#notification-preferences" className={styles.linkBtn}>
        Notification preferences
      </Link>
    </div>
  );
}
