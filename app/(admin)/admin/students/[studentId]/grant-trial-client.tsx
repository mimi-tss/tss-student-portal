"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

// Only rendered when the student has no unused trial_lesson entitlement
// yet (page.tsx's own check) — the only place this could be granted was
// the "Add ambassador / manual student" form's checkbox, at creation
// time only, which a real Stripe/webhook signup never goes through at
// all. Mirrors that same insert (lib/admin/provision-student.ts),
// against /api/admin/grant-trial-lesson.
export default function GrantTrialClient({ studentId, coaches }: { studentId: string; coaches: Coach[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coachId, setCoachId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGrant() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/grant-trial-lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, coachId: coachId || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not grant a trial lesson.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={styles.linkBtnSmall}>
        Grant a free trial lesson
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={styles.select}>
        <option value="">Any coach</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={handleGrant} disabled={saving} className={styles.ctaSmall}>
        {saving ? "Granting…" : "Grant"}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={saving} className={styles.linkBtnSmall}>
        Never mind
      </button>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
