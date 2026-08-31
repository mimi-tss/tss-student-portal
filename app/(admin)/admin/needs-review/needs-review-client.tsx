"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AttentionItem, AttentionKind, AttentionStatus } from "@/lib/admin/attention-items";
import styles from "../../admin.module.css";

const KIND_LABEL: Record<AttentionKind, string> = {
  dnc: "DNC",
  cancel_request: "Cancel Req",
  trial_unbooked: "Trial",
  credit_expiring: "Expiring",
  upgraded_suite: "Upgraded to Suite",
  upgraded_pro: "Upgraded to Pro",
  upgraded_elite: "Upgraded to Elite",
  coach_block_added: "Block Added",
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

const TABS: { status: AttentionStatus; label: string }[] = [
  { status: "needs_action", label: "Needs Action" },
  { status: "in_progress", label: "In Progress" },
  { status: "resolved", label: "Resolved" },
];

function Row({ item, onChanged }: { item: AttentionItem; onChanged: () => void }) {
  const [note, setNote] = useState(item.adminNote ?? "");
  const [saving, setSaving] = useState<AttentionStatus | "note" | null>(null);

  async function setStatus(status: AttentionStatus) {
    setSaving(status);
    await fetch("/api/admin/attention-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, status, note: note.trim() || undefined }),
    });
    setSaving(null);
    onChanged();
  }

  async function saveNote() {
    setSaving("note");
    await fetch("/api/admin/attention-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, status: item.status, note: note.trim() || undefined }),
    });
    setSaving(null);
    onChanged();
  }

  return (
    <div className={styles.naRow}>
      <span className={`${styles.naKindTag} ${KIND_CLASS[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
      <div className={styles.naInfo}>
        <div className={styles.naName}>
          {item.studentId ? (
            <Link href={`/admin/students/${item.studentId}`} className={styles.rowName}>
              {item.studentName}
            </Link>
          ) : (
            (item.studentName ?? item.coachName ?? "—")
          )}
        </div>
        <div className={styles.naSummary}>{item.summary}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            className={styles.inputSmall}
            style={{ flex: 1, minWidth: 160 }}
          />
          {note !== (item.adminNote ?? "") && (
            <button className={styles.linkBtnSmall} disabled={saving === "note"} onClick={saveNote}>
              Save note
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        {TABS.map((tab) => (
          <button
            key={tab.status}
            className={item.status === tab.status ? styles.badge : styles.badgeMuted}
            style={{ border: "none", cursor: item.status === tab.status ? "default" : "pointer", font: "inherit" }}
            disabled={item.status === tab.status || saving !== null}
            onClick={() => setStatus(tab.status)}
          >
            {saving === tab.status ? "…" : `Mark ${tab.label.toLowerCase()}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NeedsReviewClient() {
  const [tab, setTab] = useState<AttentionStatus>("needs_action");
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [counts, setCounts] = useState<Record<AttentionStatus, number>>({
    needs_action: 0,
    in_progress: 0,
    resolved: 0,
  });

  function load() {
    setItems(null);
    fetch(`/api/admin/attention-items?status=${tab}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []));
  }

  function loadCounts() {
    Promise.all(
      TABS.map((t) =>
        fetch(`/api/admin/attention-items?status=${t.status}`)
          .then((res) => res.json())
          .then((data) => [t.status, (data.items ?? []).length] as const),
      ),
    ).then((results) => setCounts(Object.fromEntries(results) as Record<AttentionStatus, number>));
  }

  useEffect(load, [tab]);
  useEffect(loadCounts, []);

  function handleChanged() {
    load();
    loadCounts();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => setTab(t.status)}
            className={tab === t.status ? styles.sidebarBtnActive : styles.sidebarBtn}
            style={{ width: "auto" }}
          >
            {t.label} ({counts[t.status]})
          </button>
        ))}
      </div>

      <div className={styles.panel}>
        {items === null && <p className={styles.mutedText}>Loading…</p>}
        {items && items.length === 0 && <p className={styles.emptyState}>Nothing here.</p>}
        {items && items.map((item) => <Row key={item.id} item={item} onChanged={handleChanged} />)}
      </div>
    </div>
  );
}
