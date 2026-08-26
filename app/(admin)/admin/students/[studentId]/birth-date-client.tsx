"use client";

import { useState } from "react";
import { formatPlainDate } from "@/lib/format-date";
import styles from "../../../admin.module.css";

// Click-to-edit, not a live inline input — an always-editable date field
// sitting in the page header text was too easy to change by accident
// (a stray click + blur used to save silently). Now nothing writes
// until "Save" is explicitly clicked.
export default function BirthDateClient({
  studentId,
  initialValue,
}: {
  studentId: string;
  initialValue: string | null;
}) {
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/set-birth-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, birthDate: value || null }),
    });
    setSaving(false);
    setSaved(value || null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {saved ? formatPlainDate(saved) : <span className={styles.mutedText}>not set</span>}
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input
        type="date"
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
          setValue(saved ?? "");
          setEditing(false);
        }}
        disabled={saving}
        className={styles.linkBtnSmall}
      >
        Cancel
      </button>
    </span>
  );
}
