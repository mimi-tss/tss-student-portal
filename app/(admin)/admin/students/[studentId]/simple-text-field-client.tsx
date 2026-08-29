"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

// Generic click-to-edit for a single optional text field on students,
// posted to /api/admin/set-student-info (same route name/email already
// use — that route accepts any subset of {name, email, phone, gender}).
// Used for phone and gender: same shape, no per-field validation beyond
// "not required" — same pattern as birth-date-client.tsx, minus the
// date-specific bits.
export default function SimpleTextFieldClient({
  studentId,
  field,
  initialValue,
  placeholder,
}: {
  studentId: string;
  field: "phone" | "gender";
  initialValue: string | null;
  placeholder?: string;
}) {
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/set-student-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, [field]: value }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save.");
      return;
    }

    setSaved(value.trim() || null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {saved ?? <span className={styles.mutedText}>not set</span>}
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
        placeholder={placeholder}
        className={styles.inputSmall}
      />
      <button onClick={handleSave} disabled={saving} className={styles.linkBtnSmall}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setValue(saved ?? "");
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
