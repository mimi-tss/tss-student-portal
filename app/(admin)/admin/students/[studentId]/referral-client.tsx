"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

// Click-to-edit, same pattern as birth-date-client.tsx — nothing writes
// until Save is explicitly clicked. Referred-by drives a permanent pay
// bonus (lib/payroll/calculate.ts's REFERRAL_BONUS_PER_HOUR), so an
// accidental one-click change here would quietly misdirect real money.
export default function ReferralClient({
  studentId,
  initialCoachId,
  coaches,
}: {
  studentId: string;
  initialCoachId: string | null;
  coaches: Coach[];
}) {
  const [saved, setSaved] = useState(initialCoachId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialCoachId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/set-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, coachId: value || null }),
    });
    setSaving(false);
    setSaved(value || null);
    setEditing(false);
  }

  const savedCoachName = coaches.find((c) => c.id === saved)?.name;

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {savedCoachName ? (
          <span className={styles.badge}>{savedCoachName}</span>
        ) : (
          <span className={styles.mutedText}>Not referred</span>
        )}
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        className={styles.selectSmall}
      >
        <option value="">Not referred</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
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
