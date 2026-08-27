"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPlainDate } from "@/lib/format-date";
import styles from "../../../admin.module.css";

// Click-to-edit, same pattern as birth-date-client.tsx — nothing writes
// until Save is explicitly clicked. This date is the anchor for the
// "4 sessions per billing cycle" cap (lib/scheduling/recurring.ts's
// occurrencesFor) — a wrong anchor shows a real session as a skipped
// "5th Wednesday" week or vice versa, so correcting it also re-syncs
// this student's already-materialized future sessions (the API route
// deletes and regenerates them under the corrected anchor), not just
// the stored date — hence the router.refresh() on save, not just local
// state.
export default function BillingAnniversaryClient({
  studentId,
  initialValue,
}: {
  studentId: string;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!value) {
      setError("A date is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/set-billing-anniversary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, billingAnniversaryDate: value }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that date.");
      return;
    }
    setSaved(value);
    setEditing(false);
    router.refresh();
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
          setError(null);
          setEditing(false);
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
