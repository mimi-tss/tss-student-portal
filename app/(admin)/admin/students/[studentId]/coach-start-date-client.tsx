"use client";

import { useState } from "react";
import { formatPlainDate } from "@/lib/format-date";
import styles from "../../../admin.module.css";

// "With you since" override — for students migrated from the old system
// whose real coaching relationship predates any session row here.
// Leaving it blank falls back to the derived "earliest session with this
// coach" date (see lib/coach/dashboard-data.ts) — `derivedValue` is that
// same fallback, computed server-side and shown here instead of a blank
// field so there's always an actual date on screen. Click-to-edit, not a
// live inline input, for the same reason as birth-date-client.tsx.
export default function CoachStartDateClient({
  studentId,
  initialValue,
  derivedValue,
}: {
  studentId: string;
  initialValue: string | null;
  derivedValue: string | null;
}) {
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/set-coach-start-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, coachStartDate: value || null }),
    });
    setSaving(false);
    setSaved(value || null);
    setEditing(false);
  }

  if (!editing) {
    const display = saved ? (
      `${formatPlainDate(saved)} (admin-set)`
    ) : derivedValue ? (
      `${formatPlainDate(derivedValue)} (auto — first session)`
    ) : (
      <span className={styles.mutedText}>not set</span>
    );

    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {display}
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
      {saved && (
        <button
          onClick={() => setValue("")}
          disabled={saving}
          className={styles.linkBtnSmall}
          title="Clear the override — falls back to the auto-derived date"
        >
          Clear override
        </button>
      )}
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
