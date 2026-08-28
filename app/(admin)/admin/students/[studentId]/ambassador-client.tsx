"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

// Purely cosmetic flag (dashboard plan label only) — unlike ReferralClient
// (drives a real pay bonus) this toggles immediately, no separate Save step.
export default function AmbassadorClient({
  studentId,
  initialAmbassador,
}: {
  studentId: string;
  initialAmbassador: boolean;
}) {
  const [checked, setChecked] = useState(initialAmbassador);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: boolean) {
    setChecked(next);
    setSaving(true);
    await fetch("/api/admin/set-ambassador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, ambassador: next }),
    });
    setSaving(false);
  }

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={(e) => handleChange(e.target.checked)}
      />
      Ambassador
      {saving && <span className={styles.mutedText}>Saving…</span>}
    </label>
  );
}
