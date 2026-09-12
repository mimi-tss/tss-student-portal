"use client";

import { useState } from "react";
import styles from "../billing.module.css";
import NotificationPreferencesClient, { type NotificationPrefs } from "./notification-preferences-client";

export interface AccountDetails {
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  addressCountry: string | null;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
}

type EditableKey = Exclude<keyof AccountDetails, "email">;

type FormState = Record<EditableKey, string>;

function toFormState(d: AccountDetails): FormState {
  return {
    name: d.name,
    phone: d.phone ?? "",
    birthDate: d.birthDate ?? "",
    gender: d.gender ?? "",
    addressStreet: d.addressStreet ?? "",
    addressCity: d.addressCity ?? "",
    addressState: d.addressState ?? "",
    addressZip: d.addressZip ?? "",
    addressCountry: d.addressCountry ?? "",
    guardianName: d.guardianName ?? "",
    guardianRelationship: d.guardianRelationship ?? "",
    guardianPhone: d.guardianPhone ?? "",
    guardianEmail: d.guardianEmail ?? "",
  };
}

// Birthday is a plain DATE column (no time) — parsing "1998-05-02" via
// `new Date(str)` reads it as UTC midnight, which can print a day early
// in a timezone behind UTC. Building the Date from explicit y/m/d parts
// instead keeps it local-midnight, so the printed date always matches
// the stored one.
function formatBirthDate(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthdayThisYear = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthdayThisYear) age--;
  return age;
}

const BASIC_FIELDS: { key: EditableKey; label: string; type?: string }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "birthDate", label: "Birthday", type: "date" },
  { key: "gender", label: "Gender" },
];

const ADDRESS_FIELDS: { key: EditableKey; label: string }[] = [
  { key: "addressStreet", label: "Street" },
  { key: "addressCity", label: "City" },
  { key: "addressState", label: "State" },
  { key: "addressZip", label: "ZIP" },
  { key: "addressCountry", label: "Country" },
];

// Contact info for a minor's parent/guardian, admin reference only —
// not a second login (that's still the student's own `email`, see
// supabase/migrations/0070_student_contact_and_guardian_info.sql). An
// adult student shows "N/A" for a blank field instead of "—" — a
// guardian genuinely doesn't apply once birthDate says 18+, vs. "—"
// meaning just not filled in yet.
const GUARDIAN_FIELDS: { key: EditableKey; label: string }[] = [
  { key: "guardianName", label: "Name" },
  { key: "guardianRelationship", label: "Relationship" },
  { key: "guardianPhone", label: "Phone" },
  { key: "guardianEmail", label: "Email" },
];

// Name/phone/etc. all live on `students`, which has no self-UPDATE RLS
// policy (admin-only writes — see lib/billing/student-stripe-link.ts's
// own comment on this) — saving goes through /api/billing/account-
// details, which re-derives the student from the session
// (resolveBillingStudent) before writing with the admin client, same
// ownership-checked privileged-write pattern as request-cancel/
// request-pause. All fields here are free text/optional except name —
// same convention migration 0070 chose for gender (source data too
// inconsistent for a fixed set) extended to everything else it added.
//
// Email is display-only, never editable: it's also the magic-link/OTP
// login identity (lib/auth/login-code.ts), and changing it would need
// its own re-verification step this doesn't build. The "Email me a
// login code" button reuses the billing site's own request-code route
// (same one /billing/login posts to) so a student can pick up a fresh
// code for signing in elsewhere.
export default function AccountDetailsClient({
  initial,
  notificationPrefs,
}: {
  initial: AccountDetails;
  notificationPrefs: NotificationPrefs;
}) {
  const [details, setDetails] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  function setField(key: EditableKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function cancelEdit() {
    setEditing(false);
    setForm(toFormState(details));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const payload: Record<string, string | null> = {};
    for (const key of Object.keys(form) as EditableKey[]) {
      payload[key] = key === "name" ? form.name.trim() : form[key].trim() || null;
    }
    const res = await fetch("/api/billing/account-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save your details.");
      return;
    }
    const next: AccountDetails = { ...details, ...(payload as Partial<AccountDetails>), name: payload.name as string };
    setDetails(next);
    setForm(toFormState(next));
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

  const guardianFallback = calcAge(details.birthDate) !== null && (calcAge(details.birthDate) as number) >= 18 ? "N/A" : "—";

  const row = (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div className={styles.card} style={{ flex: "2 1 380px", textAlign: "left" }}>
        <div className={styles.tierName} style={{ marginBottom: 12 }}>
          Account details
        </div>

        {!editing ? (
          <>
            {BASIC_FIELDS.map(({ key, label }) => (
              <div className={styles.statRow} key={key}>
                <span className={styles.statLabel}>{label}</span>
                <span>{key === "birthDate" ? (formatBirthDate(details.birthDate ?? "") ?? "—") : details[key] || "—"}</span>
              </div>
            ))}

            <div className={styles.statLabel} style={{ marginTop: 16, marginBottom: 4 }}>
              Address
            </div>
            {ADDRESS_FIELDS.map(({ key, label }) => (
              <div className={styles.statRow} key={key}>
                <span className={styles.statLabel}>{label}</span>
                <span>{details[key] || "—"}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            {BASIC_FIELDS.map(({ key, label, type }) => (
              <label className={styles.statLabel} key={key}>
                {label}
                <input
                  className={styles.input}
                  type={type ?? "text"}
                  value={form[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  required={key === "name"}
                  style={{ marginTop: 4, marginBottom: 10, width: "100%" }}
                />
              </label>
            ))}

            <div className={styles.statLabel} style={{ marginTop: 8, marginBottom: 4 }}>
              Address
            </div>
            {ADDRESS_FIELDS.map(({ key, label }) => (
              <label className={styles.statLabel} key={key}>
                {label}
                <input
                  className={styles.input}
                  value={form[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  style={{ marginTop: 4, marginBottom: 10, width: "100%" }}
                />
              </label>
            ))}
          </>
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
      </div>

      <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className={styles.card} style={{ textAlign: "left" }}>
          <div className={styles.tierName} style={{ marginBottom: 12 }}>
            Guardian details
          </div>
          {!editing
            ? GUARDIAN_FIELDS.map(({ key, label }) => (
                <div className={styles.statRow} key={key}>
                  <span className={styles.statLabel}>{label}</span>
                  <span>{details[key] || guardianFallback}</span>
                </div>
              ))
            : GUARDIAN_FIELDS.map(({ key, label }) => (
                <label className={styles.statLabel} key={key}>
                  {label}
                  <input
                    className={styles.input}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    style={{ marginTop: 4, marginBottom: 10, width: "100%" }}
                  />
                </label>
              ))}
        </div>

        <div className={styles.card} style={{ textAlign: "left" }}>
          <NotificationPreferencesClient initial={notificationPrefs} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {editing ? (
        <form onSubmit={save} style={{ marginBottom: 24 }}>
          {row}
          {error && (
            <p className={styles.errorText} style={{ marginTop: 12 }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className={styles.cta} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className={styles.linkBtn} disabled={saving} onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {row}
          {confirmation && (
            <p className={styles.successText} style={{ marginTop: 12 }}>
              {confirmation}
            </p>
          )}
          <button
            className={styles.cta}
            style={{ marginTop: 16 }}
            onClick={() => {
              setEditing(true);
              setConfirmation(null);
            }}
          >
            Edit
          </button>
        </div>
      )}
    </>
  );
}
