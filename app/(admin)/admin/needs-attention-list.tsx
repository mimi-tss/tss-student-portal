"use client";

import { useState } from "react";
import Link from "next/link";
import type { AttentionItem } from "@/lib/admin/attention-items";
import { KIND_LABEL, KIND_CLASS } from "./attention-item-row";
import styles from "../admin.module.css";

// Overview's compact preview — top 5 "needs action" items, each
// resolvable with one click (no notes here; the full note/status
// workflow lives on the Needs Review page's tabs).
export default function NeedsAttentionList({ items }: { items: AttentionItem[] }) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(item: AttentionItem) {
    setBusy(item.id);
    const res = await fetch("/api/admin/attention-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, status: "resolved" }),
    });
    setBusy(null);
    if (res.ok) setResolved((prev) => new Set(prev).add(item.id));
  }

  const visible = items.filter((i) => !resolved.has(i.id));
  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((item) => (
        <div key={item.id} className={styles.naRow}>
          <span className={`${styles.naKindTag} ${KIND_CLASS[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
          <div className={styles.naInfo}>
            <div className={styles.naName}>{item.studentName ?? item.coachName ?? "—"}</div>
            <div className={styles.naSummary}>{item.summary}</div>
          </div>
          {item.studentId ? (
            <Link href={`/admin/students/${item.studentId}`} className={styles.naAction}>
              Review
            </Link>
          ) : null}
          <button className={styles.naAction} disabled={busy === item.id} onClick={() => resolve(item)}>
            {busy === item.id ? "…" : "Resolve"}
          </button>
        </div>
      ))}
    </div>
  );
}
