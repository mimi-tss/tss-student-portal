"use client";

import { useEffect, useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import styles from "../../../admin.module.css";

interface StaffNote {
  id: string;
  note: string;
  created_at: string;
}

// Internal admin-only notes (migration 0037) — never visible to a coach
// or student, so this is deliberately its own component/table rather
// than a mode on NotesPanel (which the homework-notes API scopes to
// coach+student+admin read access).
export default function StaffNotesClient({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<StaffNote[] | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/staff-notes?studentId=${studentId}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) setNotes(body.notes);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/staff-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, note: text.trim() }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that note.");
      return;
    }

    setText("");
    await load();
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        {error && <p className={styles.errorText} style={{ marginBottom: 4 }}>{error}</p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Add a staff-only note — never visible to the coach or student…"
          className={styles.input}
          style={{ display: "block", width: "100%", marginBottom: 6 }}
        />
        <button onClick={handleAdd} disabled={saving || !text.trim()} className={styles.ctaSmall}>
          {saving ? "Saving…" : "Add note"}
        </button>
      </div>

      {notes === null && <p className={styles.mutedText}>Loading…</p>}
      {notes !== null && notes.length === 0 && (
        <p className={styles.mutedText}>No staff notes yet.</p>
      )}
      {notes && notes.length > 0 && (
        <ul className={styles.list}>
          {notes.map((n) => (
            <li key={n.id} className={styles.listItem}>
              <p style={{ whiteSpace: "pre-wrap" }}>{n.note}</p>
              <p className={styles.mutedText} style={{ fontSize: 11, marginTop: 4 }}>
                <FormattedDateTime value={n.created_at} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
