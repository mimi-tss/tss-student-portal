"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Exercise {
  id: string;
  title: string;
}

const MAX_SUGGESTIONS = 8;

// Type-to-filter exercise picker — matches anywhere in the title (not
// just prefix). Shared between coach and admin (admin now has the same
// exercise-assigning ability as a coach on a student's detail view), so
// this uses Tailwind arbitrary var() classes rather than a CSS module,
// same reasoning as components/shared-folder-panel.tsx — it needs to
// render correctly under any route group's theme root.
export default function AssignExercisePanel({
  studentId,
  exercises,
  assignedExerciseIds,
  onAssigned,
}: {
  studentId: string;
  exercises: Exercise[];
  // Already-assigned exercise ids for this student — excluded from the
  // picker so there's no way to even attempt a duplicate assign (the
  // unique constraint in migration 0052 is the real guard; this is just
  // the UI not offering the dead end in the first place).
  assignedExerciseIds?: string[];
  // Called after a successful assign, in addition to router.refresh() —
  // needed by callers (like the coach dashboard) whose assigned-list is
  // client-side state rather than derived fresh from server props, so a
  // router refresh alone wouldn't update what's on screen.
  onAssigned?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>();
  const router = useRouter();

  const assignableExercises = useMemo(() => {
    if (!assignedExerciseIds || assignedExerciseIds.length === 0) return exercises;
    const assigned = new Set(assignedExerciseIds);
    return exercises.filter((ex) => !assigned.has(ex.id));
  }, [exercises, assignedExerciseIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assignableExercises.slice(0, MAX_SUGGESTIONS);
    return assignableExercises.filter((ex) => ex.title.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [query, assignableExercises]);

  function pick(ex: Exercise) {
    setQuery(ex.title);
    setSelectedId(ex.id);
    setOpen(false);
    setDone(false);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[highlighted]) pick(matches[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  async function handleAssign() {
    if (!selectedId) return;
    setAssigning(true);
    setDone(false);
    setError(null);
    // The fetch itself (not just a non-2xx response) previously had no
    // error handling — a dropped connection or timeout left `assigning`
    // stuck true forever, with the button reading "Assigning…"
    // indefinitely and no way to tell what happened or retry short of a
    // page reload. Same class of bug already fixed on the Needs Review
    // page for the same reason.
    try {
      const res = await fetch("/api/exercises/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: selectedId, studentId }),
      });
      const body = await res.json().catch(() => ({}));
      setAssigning(false);
      if (res.ok) {
        setDone(true);
        setQuery("");
        setSelectedId(null);
        // The assigned-exercises list below this panel is rendered by the
        // parent server component from data fetched at page load — without
        // this it stays on the pre-assign snapshot until a manual reload.
        router.refresh();
        onAssigned?.();
      } else {
        setError(body.error ?? "Assign failed.");
      }
    } catch {
      setAssigning(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  if (exercises.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No exercises in the catalog yet.</p>;
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-[180px] flex-1">
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
          value={query}
          placeholder="Type to search exercises…"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId(null);
            setDone(false);
            setError(null);
            setHighlighted(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on a suggestion registers before the list
            // unmounts.
            blurTimeout.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
        />
        {open && (
          <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-[220px] list-none overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
            {matches.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-[var(--text-muted)]">No matching exercises.</li>
            ) : (
              matches.map((ex, i) => (
                <li
                  key={ex.id}
                  className={`cursor-pointer rounded-md px-2.5 py-2 text-sm ${
                    i === highlighted ? "bg-[var(--surface)]" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(ex);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  {ex.title}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <button
        onClick={handleAssign}
        disabled={assigning || !selectedId}
        className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--gold-text)] disabled:opacity-50"
      >
        {assigning ? "Assigning…" : "Assign"}
      </button>
      {done && <span className="text-sm text-[var(--text-muted)]">Assigned.</span>}
      {error && <span className="text-sm text-[var(--coral)]">{error}</span>}
    </div>
  );
}
