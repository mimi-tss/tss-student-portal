"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

const TIER_LABEL: Record<string, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

const TIER_OPTIONS = ["lite", "suite", "pro", "elite"];

// Membership tier is normally set by the Kajabi webhook
// (app/api/webhooks/kajabi/route.ts's purchase.created handler), not by
// admin. This manual override exists for exception cases (see the
// biweekly cadence add-on this label also reflects) — same click-to-edit
// pattern as referral-client.tsx, but gated behind a confirm since it's
// overwriting what Kajabi has on file. That confirm is a one-time
// heads-up, not a lock: the webhook's own update is unconditional, so
// the next real Kajabi purchase/upgrade event overwrites this again
// regardless, same as before the override existed.
export default function MembershipTierClient({
  studentId,
  initialTier,
  cadence,
}: {
  studentId: string;
  initialTier: string;
  cadence: "weekly" | "biweekly";
}) {
  const [saved, setSaved] = useState(initialTier);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (value === saved) {
      setEditing(false);
      return;
    }

    const confirmed = window.confirm(
      "This overwrites the membership tier Kajabi has on file for this student. " +
        "It won't stop Kajabi from syncing — the next real purchase or plan change " +
        "there will overwrite this again automatically. Continue?",
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/set-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, tier: value }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save the membership tier.");
      return;
    }

    setSaved(value);
    setEditing(false);
  }

  const label = `${TIER_LABEL[saved] ?? saved}${cadence === "biweekly" ? " (Biweekly)" : ""}`;

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span className={styles.badge}>{label}</span>
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        className={styles.selectSmall}
      >
        {TIER_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {TIER_LABEL[t]}
          </option>
        ))}
      </select>
      <button onClick={handleSave} disabled={saving} className={styles.linkBtnSmall}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setValue(saved);
          setEditing(false);
          setError(null);
        }}
        disabled={saving}
        className={styles.linkBtnSmall}
      >
        Cancel
      </button>
      {error && <span className={styles.errorText}>{error}</span>}
    </span>
  );
}
