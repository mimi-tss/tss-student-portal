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

function coachName(note: Note): string {
  const c = note.coaches;
  if (!c) return "Coach";
  return Array.isArray(c) ? (c[0]?.name ?? "Coach") : c.name;
}

// Homework notes (TSS_App_Spec_1.md section 8) — a dated running log per
// student, shared across whichever coach currently or previously worked
// with them (migration 0022), not siloed per coach. `canAdd` shows the
// composer (coaches only — students and admin get read-only, admin
// still sees everything since it queries the same endpoint). `initialLimit`
// collapses to the most recent N with an expand toggle, per spec's
// "shows recent ~5-8 entries by default" for the student view; omit it
// to always show everything (coach/admin views). `dark` switches to the
// light-on-dark palette used by the student layout's theme (section 8).
export default function NotesPanel({
  studentId,
  canAdd = false,
  initialLimit,
  dark = false,
}: {
  studentId: string;
  canAdd?: boolean;
  initialLimit?: number;
  dark?: boolean;
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
          {error && (
            <p className={dark ? "mb-1 text-xs text-[#e85c86]" : "mb-1 text-xs text-red-600"}>
              {error}
            </p>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Add a homework note…"
            className={
              dark
                ? "mb-1 w-full rounded-lg border border-[#2c2c3d] bg-[#20202f] p-2 text-sm text-[#f4f0e6] placeholder:text-[#9997ab]"
                : "mb-1 w-full rounded border p-2 text-sm"
            }
          />
          <div className="flex items-center justify-between">
            <label
              className={
                dark
                  ? "flex items-center gap-1 text-xs text-[#9997ab]"
                  : "flex items-center gap-1 text-xs text-gray-500"
              }
            >
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
              className={
                dark
                  ? "rounded-lg bg-[#a78bfa] px-3 py-1 text-xs font-bold text-[#241a3d] disabled:opacity-50"
                  : "rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
              }
            >
              {saving ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      )}

      {notes === null && (
        <p className={dark ? "text-sm text-[#9997ab]" : "text-sm text-gray-500"}>Loading…</p>
      )}
      {notes !== null && notes.length === 0 && (
        <p className={dark ? "text-sm text-[#9997ab]" : "text-sm text-gray-500"}>
          No homework notes yet.
        </p>
      )}

      {visible && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((n) => (
            <li
              key={n.id}
              className={
                dark
                  ? "rounded-lg border border-[#2c2c3d] bg-[#20202f] p-3 text-sm"
                  : "rounded border p-2 text-sm"
              }
            >
              <p className="whitespace-pre-wrap">
                {n.pinned && <span className="mr-1 text-amber-600">📌</span>}
                {n.note}
              </p>
              <p className={dark ? "mt-1 text-xs text-[#9997ab]" : "mt-1 text-xs text-gray-500"}>
                {coachName(n)} · <FormattedDateTime value={n.created_at} />
              </p>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className={
            dark
              ? "mt-2 text-xs text-[#a78bfa] underline"
              : "mt-2 text-xs text-blue-600 underline"
          }
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}
