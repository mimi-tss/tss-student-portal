"use client";

import { useState } from "react";
import { formatPlainDate, formatTenure } from "@/lib/format-date";
import styles from "../../../admin.module.css";

// "With us" override — for students migrated in (CSV bulk import) whose
// real start date predates their row being created here. Leaving it
// blank falls back to created_at, same override/fallback pattern as
// coach-start-date-client.tsx. Click-to-edit, same reason as
// birth-date-client.tsx.
export default function StudentSinceClient({
  studentId,
  initialValue,
  createdAt,
}: {
  studentId: string;
  initialValue: string | null;
  createdAt: string;
}) {
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/set-student-since", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, studentSince: value || null }),
    });
    setSaving(false);
    setSaved(value || null);
    setEditing(false);
  }

  const effective = saved ?? createdAt;

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {formatTenure(effective)} {saved ? "(admin-set)" : "(auto — account created)"}
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
          title="Clear the override — falls back to account creation date"
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
      <span className={styles.mutedText}>account created {formatPlainDate(createdAt.slice(0, 10))}</span>
    </span>
  );
}
