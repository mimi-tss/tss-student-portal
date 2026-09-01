"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../admin.module.css";

interface CreditLine {
  id: number;
  quantity: number;
  expiresAt: string;
}

let nextLineId = 1;

function newLine(): CreditLine {
  return { id: nextLineId++, quantity: 1, expiresAt: "" };
}

// Multiple lines in one go — e.g. 2 expiring 9/26 and 2 expiring 10/14 —
// each posted as its own call to /api/admin/add-credit (which already
// takes a quantity per call, no batch endpoint needed). Stops at the
// first failing line rather than rolling back the ones that already
// succeeded — those credits are real, so the error says how many landed
// and leaves the remaining lines in the form to retry.
export default function AddCreditClient({
  studentId,
  onAdded,
}: {
  studentId: string;
  // Callers that render this next to a live list of the student's own
  // credits (the student detail page's "Session credits" panel) need
  // that list to actually reflect what was just added — this component
  // itself renders no list, so a router.refresh() alone isn't enough
  // signal for those callers to know when to expect fresh data.
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [lines, setLines] = useState<CreditLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = lines.length > 0 && lines.every((l) => l.expiresAt && l.quantity >= 1);

  function updateLine(id: number, patch: Partial<CreditLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleAdd() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    let addedSoFar = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const res = await fetch("/api/admin/add-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          expiresAt: new Date(`${line.expiresAt}T23:59:59`).toISOString(),
          durationMinutes,
          quantity: line.quantity,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaving(false);
        setError(
          `${addedSoFar > 0 ? `${addedSoFar} credit(s) already added. ` : ""}${
            body.error ?? "Could not add credit."
          }`,
        );
        // Drop the lines that already succeeded, keep the failed one
        // (and anything after it) in the form so it's a straight retry.
        setLines(lines.slice(i));
        return;
      }
      addedSoFar += line.quantity;
    }

    setSaving(false);
    setSaved(true);
    setOpen(false);
    setDurationMinutes(30);
    setLines([newLine()]);
    router.refresh();
    onAdded?.();
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <select
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className={styles.selectSmall}
        >
          <option value={30}>30 min</option>
          <option value={60}>60 min</option>
        </select>
        <span className={styles.mutedText}>applies to all lines below</span>
      </div>

      {lines.map((line) => (
        <div key={line.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <input
            type="number"
            min={1}
            max={10}
            value={line.quantity}
            onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })}
            className={styles.inputSmall}
            style={{ width: 52 }}
          />
          <span className={styles.mutedText}>expiring</span>
          <input
            type="date"
            value={line.expiresAt}
            onChange={(e) => updateLine(line.id, { expiresAt: e.target.value })}
            className={styles.inputSmall}
          />
          {/* A day that doesn't exist for the picked month (e.g. Nov 31)
              resolves this input's own value to "" even though the
              typed digits are still showing in the box — the disabled
              Add button below gives no clue why, so say it here. */}
          {!line.expiresAt && (
            <span className={styles.errorText} style={{ fontSize: "0.8em" }}>
              pick a valid date
            </span>
          )}
          {lines.length > 1 && (
            <button onClick={() => removeLine(line.id)} className={styles.linkBtnSmall}>
              Remove
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setLines((prev) => [...prev, newLine()])} className={styles.linkBtnSmall}>
          + Add another line
        </button>
        <button onClick={handleAdd} disabled={!canSubmit || saving} className={styles.ctaSmall}>
          {saving ? "Adding…" : "Add"}
        </button>
        <button onClick={() => setOpen(false)} className={styles.linkBtnSmall}>
          Cancel
        </button>
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
