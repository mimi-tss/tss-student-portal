"use client";

import { useState } from "react";
import Link from "next/link";
import type { AttentionItem, AttentionKind, AttentionStatus } from "@/lib/admin/attention-items";
import styles from "../admin.module.css";

// Single source of truth for kind labels/colors — was duplicated
// across needs-review-client.tsx, needs-attention-list.tsx, and (as of
// this component) the student detail page's own Needs Review panel.
export const KIND_LABEL: Record<AttentionKind, string> = {
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
  fifth_week_available: "5th Week",
  group_lesson_understaffed: "Group Class Cancelled",
};

export const KIND_CLASS: Record<AttentionKind, string> = {
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
  fifth_week_available: styles.naKindTrial,
  group_lesson_understaffed: styles.naKindCancel,
};

export const STATUS_TABS: { status: AttentionStatus; label: string }[] = [
  { status: "needs_action", label: "Needs Action" },
  { status: "in_progress", label: "In Progress" },
  { status: "resolved", label: "Resolved" },
];

// One row, full action set (note, status buttons, kind-specific
// action) — used by the Needs Review page itself and by the student
// detail page's own "Needs Review" panel (same box, same actions,
// just pre-filtered to one student — no reason to make admin bounce
// back to the main queue to act on something they're already looking
// at). `showStudentLink` hides the redundant "view student" link when
// this is already rendered on that student's own page.
export function AttentionItemRow({
  item,
  onChanged,
  showStudentLink = true,
}: {
  item: AttentionItem;
  onChanged: () => void;
  showStudentLink?: boolean;
}) {
  const [note, setNote] = useState(item.adminNote ?? "");
  const [saving, setSaving] = useState<AttentionStatus | "note" | null>(null);
  const [addingLesson, setAddingLesson] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Books the exact same day/time the student already has weekly — no
  // credit, no trial, same "admin can book a plain session on a
  // student's behalf" path the admin booking page itself uses. On
  // success, resolves this item the same way any other fix-it action
  // here does.
  async function addFifthWeekLesson() {
    if (!item.studentId || !item.coachId || !item.occurrenceAt) return;
    setAddingLesson(true);
    setAddError(null);

    const res = await fetch("/api/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: item.studentId,
        slotStart: item.occurrenceAt,
        coachId: item.coachId,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setAddingLesson(false);

    if (!res.ok) {
      setAddError(body.error ?? "Couldn't add that lesson.");
      return;
    }

    await fetch("/api/admin/attention-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, status: "resolved", note: note.trim() || undefined }),
    });
    onChanged();
  }

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
          {showStudentLink && item.studentId ? (
            <Link href={`/admin/students/${item.studentId}`} className={styles.rowName}>
              {item.studentName}
            </Link>
          ) : (
            (item.studentName ?? item.coachName ?? "—")
          )}
        </div>
        <div className={styles.naSummary}>{item.summary}</div>
        {item.kind === "fifth_week_available" && item.status !== "resolved" && (
          <div style={{ marginTop: 8 }}>
            <button className={styles.linkBtnSmall} disabled={addingLesson} onClick={addFifthWeekLesson}>
              {addingLesson ? "Adding…" : "Add lesson"}
            </button>
            {addError && (
              <span className={styles.errorText} style={{ marginLeft: 8 }}>
                {addError}
              </span>
            )}
          </div>
        )}
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
        {STATUS_TABS.map((tab) => (
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
