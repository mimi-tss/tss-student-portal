"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ExercisePlayer from "@/components/exercise-player";

interface AssignedExercise {
  id: string;
  exerciseId: string | null;
  title: string;
  description: string | null;
  audioUrl: string | null;
}

// Renders the assigned-exercises list plus an "Unassign" per row (RLS,
// migration 0074, scopes a coach's delete to their own students; admin
// is already covered by their existing for-all policy — no route-level
// role check needed here beyond what /api/exercises/assign/route.ts's
// DELETE handler already does). Shared between coach dashboard and admin
// student detail — Tailwind arbitrary var() classes rather than a CSS
// module, same reasoning as components/assign-exercise-panel.tsx, so it
// renders correctly under either route group's theme root.
export default function AssignedExercisesList({
  assignedExercises,
  emptyText = "Nothing assigned yet.",
  onUnassigned,
}: {
  assignedExercises: AssignedExercise[];
  emptyText?: string;
  onUnassigned?: () => void;
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUnassign(assignmentId: string) {
    setRemovingId(assignmentId);
    setError(null);
    const res = await fetch("/api/exercises/assign", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId }),
    });
    setRemovingId(null);
    if (res.ok) {
      router.refresh();
      onUnassigned?.();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Unassign failed.");
    }
  }

  if (assignedExercises.length === 0) {
    return <p className="mt-2.5 text-sm text-[var(--text-muted)]">{emptyText}</p>;
  }

  return (
    <div className="mt-3.5">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {assignedExercises.map((ex, i) => (
          <li
            key={ex.id}
            className={`pt-3 ${i === 0 ? "" : "border-t border-[var(--border)]"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-sm text-[var(--text)]">{ex.title}</p>
              <button
                type="button"
                onClick={() => handleUnassign(ex.id)}
                disabled={removingId === ex.id}
                className="flex-none text-xs text-[var(--coral)] underline disabled:opacity-50"
              >
                {removingId === ex.id ? "Removing…" : "Unassign"}
              </button>
            </div>
            {ex.audioUrl && (
              <div className="mt-1.5">
                <ExercisePlayer src={ex.audioUrl} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-[var(--coral)]">{error}</p>}
    </div>
  );
}
