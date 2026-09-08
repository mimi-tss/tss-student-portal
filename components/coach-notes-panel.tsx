"use client";

import { useEffect, useState } from "react";
import { FormattedDateTime } from "./formatted-time";

interface Note {
  id: string;
  note: string;
  created_at: string;
  coach_id: string;
  coaches: { name: string } | { name: string }[] | null;
}

// A null coach_id (same reasoning as homework_notes, migration 0036)
// means an admin wrote this note, not a coach with a since-deleted row.
function coachName(note: Note): string {
  const c = note.coaches;
  if (!c) return "Admin";
  return Array.isArray(c) ? (c[0]?.name ?? "Admin") : c.name;
}

// Coach notes (migration 0100) — like NotesPanel's homework notes, but
// never visible to the student at all, not even a single latest one.
// Styled in --slot-group (the calendar's existing green, reused rather
// than adding a new token) specifically so a coach scanning a student's
// page can tell a coach note apart from a homework note (gold) at a
// glance, per direct ask — they'd otherwise look identical.
export default function CoachNotesPanel({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/coach-notes?studentId=${studentId}`);
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

    const res = await fetch("/api/coach-notes", {
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
      <div className="mb-3">
        {error && <p className="mb-1 text-xs text-[var(--coral)]">{error}</p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Add a coach note — never visible to the student…"
          className="mb-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
        />
        <div className="flex items-center justify-end">
          <button
            onClick={handleAdd}
            disabled={saving || !text.trim()}
            className="rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-50"
            style={{ background: "var(--slot-group)", color: "var(--slot-group-text)" }}
          >
            {saving ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>

      {notes === null && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {notes !== null && notes.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No coach notes yet.</p>
      )}

      {notes && notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm"
              style={{ borderLeft: "3px solid var(--slot-group)" }}
            >
              <p className="whitespace-pre-wrap">{n.note}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {coachName(n)} · <FormattedDateTime value={n.created_at} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
