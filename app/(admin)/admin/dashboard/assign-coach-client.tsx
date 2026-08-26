"use client";

import { useState } from "react";
import styles from "../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

export default function AssignCoachClient({
  studentId,
  currentCoachId,
  coaches,
}: {
  studentId: string;
  currentCoachId: string | null;
  coaches: Coach[];
}) {
  const [value, setValue] = useState(currentCoachId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    setSaved(false);

    const res = await fetch("/api/admin/assign-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, coachId: value }),
    });

    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className={styles.selectSmall}
      >
        <option value="" disabled>
          Select a coach
        </option>
        {coaches.map((coach) => (
          <option key={coach.id} value={coach.id}>
            {coach.name}
          </option>
        ))}
      </select>
      <button onClick={handleSave} disabled={!value || saving} className={styles.ctaSmall}>
        {saving ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
