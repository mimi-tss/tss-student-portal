"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

interface GuardianInfo {
  name: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
}

function formatGuardian(g: GuardianInfo): string | null {
  if (!g.name) return null;
  const parts = [g.name, g.relationship].filter(Boolean).join(" — ");
  const contact = [g.phone, g.email].filter(Boolean).join(" · ");
  return contact ? `${parts} (${contact})` : parts;
}

// Parent/guardian contact for a minor student — admin-only reference,
// never a second login account. Never selected by any coach-facing
// query (lib/coach/dashboard-data.ts); coach doesn't see this at all.
export default function GuardianInfoClient({
  studentId,
  initialValue,
}: {
  studentId: string;
  initialValue: GuardianInfo;
}) {
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/set-guardian-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, ...value }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save the guardian info.");
      return;
    }

    setSaved(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {formatGuardian(saved) ?? <span className={styles.mutedText}>not set</span>}
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Name"
          value={value.name ?? ""}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
        <input
          placeholder="Relationship (e.g. Mother)"
          value={value.relationship ?? ""}
          onChange={(e) => setValue({ ...value, relationship: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
        <input
          placeholder="Phone"
          value={value.phone ?? ""}
          onChange={(e) => setValue({ ...value, phone: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
        <input
          placeholder="Email"
          value={value.email ?? ""}
          onChange={(e) => setValue({ ...value, email: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
      </span>
      <span style={{ display: "flex", gap: 8 }}>
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
    </span>
  );
}
