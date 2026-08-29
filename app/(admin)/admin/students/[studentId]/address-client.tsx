"use client";

import { useState } from "react";
import styles from "../../../admin.module.css";

interface Address {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

function formatAddress(a: Address): string | null {
  const cityStateZip = [a.city, a.state, a.zip].filter(Boolean).join(", ");
  const parts = [a.street, cityStateZip, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Click-to-edit, all 5 parts shown together since they're always
// edited as one unit — same grouped-route pattern as set-student-info
// (name+email). street/zip here are admin-only (never selected by any
// coach-facing query) — coach only ever sees city/state/country.
export default function AddressClient({
  studentId,
  initialValue,
}: {
  studentId: string;
  initialValue: Address;
}) {
  const [saved, setSaved] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/set-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, ...value }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save the address.");
      return;
    }

    setSaved(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {formatAddress(saved) ?? <span className={styles.mutedText}>not set</span>}
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Street"
          value={value.street ?? ""}
          onChange={(e) => setValue({ ...value, street: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
        <input
          placeholder="City"
          value={value.city ?? ""}
          onChange={(e) => setValue({ ...value, city: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
        <input
          placeholder="State"
          value={value.state ?? ""}
          onChange={(e) => setValue({ ...value, state: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
        <input
          placeholder="Zip"
          value={value.zip ?? ""}
          onChange={(e) => setValue({ ...value, zip: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
        <input
          placeholder="Country"
          value={value.country ?? ""}
          onChange={(e) => setValue({ ...value, country: e.target.value })}
          disabled={saving}
          className={styles.inputSmall}
        />
      </span>
      <span style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} disabled={saving} className={styles.linkBtnSmall}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => {
            setValue(saved);
            setEditing(false);
            setError(null);
          }}
          disabled={saving}
          className={styles.linkBtnSmall}
        >
          Cancel
        </button>
        {error && <span className={styles.errorText}>{error}</span>}
      </span>
    </span>
  );
}
