"use client";

import { useState } from "react";
import Link from "next/link";
import type { AttentionItem, AttentionKind } from "@/lib/admin/attention-items";
import styles from "../admin.module.css";

const KIND_LABEL: Record<AttentionKind, string> = {
  dnc: "DNC",
  cancel_request: "Cancel Req",
  trial_unbooked: "Trial",
  credit_expiring: "Expiring",
  upgraded_suite: "Upgraded",
  upgraded_pro: "Upgraded",
  upgraded_elite: "Upgraded",
  coach_block_added: "Block",
  no_show_1: "No-Show",
  no_show_2: "No-Show ×2",
  no_show_3: "No-Show ×3",
  no_recurring_schedule: "No Schedule",
  hold_ending_soon: "Hold Ending",
  inactive_10_days: "Inactive",
  recording_unmatched: "Unmatched Recording",
  recording_missing: "Missing Recording",
};

const KIND_CLASS: Record<AttentionKind, string> = {
  dnc: styles.naKindDnc,
  cancel_request: styles.naKindCancel,
  trial_unbooked: styles.naKindTrial,
  credit_expiring: styles.naKindCredit,
  upgraded_suite: styles.naKindTrial,
  upgraded_pro: styles.naKindTrial,
  upgraded_elite: styles.naKindPause,
  coach_block_added: styles.naKindCancel,
  no_show_1: styles.naKindDnc,
  no_show_2: styles.naKindDnc,
  no_show_3: styles.naKindDnc,
  no_recurring_schedule: styles.naKindPause,
  hold_ending_soon: styles.naKindPause,
  inactive_10_days: styles.naKindCancel,
  recording_unmatched: styles.naKindCredit,
  recording_missing: styles.naKindCredit,
};

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
