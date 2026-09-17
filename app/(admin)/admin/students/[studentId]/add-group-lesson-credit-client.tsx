"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../admin.module.css";

interface CreditLine {
  id: number;
  quantity: number;
  expiresAt: string;
}

let nextLineId = 1;

// Defaults to one year out — matches the studio's own "schedule anytime
// within a year" copy on the purchased packs (lib/billing/addons.ts) —
// still just a starting value, admin can change or clear it (blank = no
// expiry) per line.
function oneYearFromNow(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function newLine(): CreditLine {
  return { id: nextLineId++, quantity: 4, expiresAt: oneYearFromNow() };
}

// Group-lesson counterpart to AddCreditClient (admin/dashboard/add-
// credit-client.tsx) — same multi-line-in-one-go shape, but a topic
// (matched exactly against a class's own topic at redemption time, see
// lib/group-lesson-credits.ts) instead of a 30/60-min duration. Defaults
// quantity to 4 since the main use case right now is granting a
// purchased 4-Pack Group Class add-on's credits — still freely editable.
// `topics` is a datalist suggestion list (real topics currently in use),
// not a locked dropdown — group_lessons.topic has always been free text
// an admin sets per class/series, no fixed enum to constrain to, but a
// mistyped topic here means a silently unredeemable credit, so
// suggestions matter more than they would for a real dropdown.
export default function AddGroupLessonCreditClient({
  studentId,
  topics,
  onAdded,
}: {
  studentId: string;
  topics: string[];
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [lines, setLines] = useState<CreditLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!topic.trim() && lines.length > 0 && lines.every((l) => l.quantity >= 1);

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
      const res = await fetch("/api/admin/add-group-lesson-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          topic: topic.trim(),
          expiresAt: line.expiresAt ? new Date(`${line.expiresAt}T23:59:59`).toISOString() : null,
          quantity: line.quantity,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaving(false);
        setError(
          `${addedSoFar > 0 ? `${addedSoFar} credit(s) already added. ` : ""}${body.error ?? "Could not add credit."}`,
        );
        setLines(lines.slice(i));
        return;
      }
      addedSoFar += line.quantity;
    }

    setSaving(false);
    setSaved(true);
    setOpen(false);
    setTopic("");
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
        <input
          type="text"
          list="group-lesson-topics"
          placeholder="Topic (must match the class exactly)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={styles.inputSmall}
          style={{ width: 240 }}
        />
        <datalist id="group-lesson-topics">
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
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
          <span className={styles.mutedText}>(blank = no expiry)</span>
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
