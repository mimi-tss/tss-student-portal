"use client";

import { useState } from "react";
import styles from "../../admin.module.css";

export default function AddCreditClient({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!expiresAt) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/add-credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(),
        durationMinutes,
      }),
    });

    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setOpen(false);
      setExpiresAt("");
      setDurationMinutes(30);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add credit.");
    }
  }

  if (!open) {
    return (
      <div>
        <button onClick={() => setOpen(true)} className={styles.linkBtnSmall}>
          {saved ? "Add another credit" : "Add credit"}
        </button>
        {saved && <p className={styles.successText}>Credit added</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <select
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(Number(e.target.value))}
        className={styles.selectSmall}
      >
        <option value={30}>30 min</option>
        <option value={60}>60 min</option>
      </select>
      <input
        type="date"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        className={styles.inputSmall}
      />
      <button onClick={handleAdd} disabled={!expiresAt || saving} className={styles.ctaSmall}>
        {saving ? "…" : "Add"}
      </button>
      <button onClick={() => setOpen(false)} className={styles.linkBtnSmall}>
        Cancel
      </button>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
