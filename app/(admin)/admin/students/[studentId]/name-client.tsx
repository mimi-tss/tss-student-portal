"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

// Click-to-edit page title. Same pattern as email-client.tsx, styled as
// the h1 in view mode rather than a stat-row value.
export default function NameClient({
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
    if (!value.trim()) {
      setError("name can't be empty");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/set-student-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, name: value }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save the name.");
      return;
    }

    setSaved(value.trim());
    setEditing(false);
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
        <h1 className={styles.pageTitle} style={{ marginBottom: 0 }}>
          {saved}
        </h1>
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        className={styles.input}
        style={{ fontSize: "1.4rem" }}
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
