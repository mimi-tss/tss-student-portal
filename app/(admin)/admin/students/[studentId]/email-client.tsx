"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

// Click-to-edit, same pattern as birth-date-client.tsx. Doubles as the
// Kajabi webhook's match key (app/api/webhooks/kajabi/route.ts) — see
// the comment on /api/admin/set-student-info for what that implies.
export default function EmailClient({
  studentId,
  initialValue,
}: {
  studentId: string;
  initialValue: string;
}) {
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/set-student-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, email: value }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save the email.");
      return;
    }

    setSaved(value.trim().toLowerCase());
    setEditing(false);
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {saved}
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        className={styles.inputSmall}
      />
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
