"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Coach {
  id: string;
  name: string;
}

// Admin-only substitute assignment for one already-scheduled session —
// students and coaches can't change this themselves. Distinct from
// changing the student's overall assigned coach or their recurring
// schedule's coach (see assign-coach-client.tsx and
// recurring-schedule-client.tsx) — this affects only this one session's
// actual_coach_id.
export default function ReassignSessionCoach({
  sessionId,
  currentCoachId,
  coaches,
  onSuccess,
}: {
  sessionId: string;
  currentCoachId: string | null;
  coaches: Coach[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentCoachId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!value || value === currentCoachId) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/reassign-session-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, coachId: value }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not reassign that session.");
      return;
    }

    setEditing(false);
    router.refresh();
    onSuccess?.();
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs text-blue-600 underline">
        Reassign coach
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-xs">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded border px-1 py-0.5"
      >
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-black px-2 py-0.5 text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setEditing(false)} disabled={saving} className="text-gray-500 underline">
        Cancel
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
