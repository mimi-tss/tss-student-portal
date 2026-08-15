"use client";

import { useState } from "react";

interface Coach {
  id: string;
  name: string;
}

export default function AssignCoachClient({
  studentId,
  currentCoachId,
  coaches,
}: {
  studentId: string;
  currentCoachId: string | null;
  coaches: Coach[];
}) {
  const [value, setValue] = useState(currentCoachId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    setSaved(false);

    const res = await fetch("/api/admin/assign-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, coachId: value }),
    });

    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="" disabled>
          Select a coach
        </option>
        {coaches.map((coach) => (
          <option key={coach.id} value={coach.id}>
            {coach.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={!value || saving}
        className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
