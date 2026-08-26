"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

// Admin-only substitute assignment for one already-scheduled session —
// students and coaches can't change this themselves. Distinct from
// changing the student's overall assigned coach or their recurring
// schedule's coach (see assign-coach-client.tsx and
// recurring-schedule-client.tsx) — this affects only this one session's
// actual_coach_id.
export default function ReassignSessionCoach({
  sessionId,
  currentCoachId,
  coaches,
  onSuccess,
}: {
  sessionId: string;
  currentCoachId: string | null;
  coaches: Coach[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentCoachId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!value || value === currentCoachId) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/reassign-session-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, coachId: value }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not reassign that session.");
      return;
    }

    setEditing(false);
    router.refresh();
    onSuccess?.();
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
        Reassign coach
      </button>
    );
  }

  return (
    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={styles.selectSmall}
      >
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={saving}
        className={styles.ctaSmall}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setEditing(false)} disabled={saving} className={styles.linkBtnSmall}>
        Cancel
      </button>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
