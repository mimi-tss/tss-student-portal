"use client";

import { useEffect, useState } from "react";
import { FormattedDateTime } from "./formatted-time";

interface Note {
  id: string;
  note: string;
  pinned: boolean;
  created_at: string;
  coach_id: string;
  coaches: { name: string } | { name: string }[] | null;
}

// A null coach_id (migration 0036) means an admin wrote this note, not
// a coach with a since-deleted row — there's no other reason coach_id
// would be empty.
function coachName(note: Note): string {
  const c = note.coaches;
  if (!c) return "Admin";
  return Array.isArray(c) ? (c[0]?.name ?? "Admin") : c.name;
}

// Homework notes (TSS_App_Spec_1.md section 8) — a dated running log per
// student, shared across whichever coach currently or previously worked
// with them (migration 0022), not siloed per coach. `canAdd` shows the
// composer (coaches and admin — migration 0036; students get read-only).
// `initialLimit` collapses to the most recent N with an expand toggle,
// per spec's "shows recent ~5-8 entries by default" for the student
// view; omit it to always show everything (coach/admin views).
export default function NotesPanel({
  studentId,
  canAdd = false,
  initialLimit,
}: {
  studentId: string;
  canAdd?: boolean;
  initialLimit?: number;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/notes?studentId=${studentId}`);
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

    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, note: text.trim(), pinned }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that note.");
      return;
    }

    setText("");
    setPinned(false);
    await load();
  }

  const visible =
    !expanded && initialLimit && notes ? notes.slice(0, initialLimit) : notes;
  const hiddenCount =
    initialLimit && notes ? Math.max(0, notes.length - initialLimit) : 0;

  return (
    <div>
      {canAdd && (
        <div className="mb-3">
          {error && <p className="mb-1 text-xs text-[var(--coral)]">{error}</p>}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Add a homework note…"
            className="mb-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              Pin this note
            </label>
            <button
              onClick={handleAdd}
              disabled={saving || !text.trim()}
              className="rounded-lg bg-[var(--gold)] px-3 py-1 text-xs font-bold text-[var(--gold-text)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      )}

      {notes === null && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {notes !== null && notes.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No homework notes yet.</p>
      )}

      {visible && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((n) => (
            <li key={n.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
              <p className="whitespace-pre-wrap">
                {n.pinned && <span className="mr-1 text-amber-600">📌</span>}
                {n.note}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {coachName(n)} · <FormattedDateTime value={n.created_at} />
              </p>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-2 text-xs text-[var(--gold)] underline">
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}
