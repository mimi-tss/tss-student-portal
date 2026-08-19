"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DAY_NAMES } from "@/lib/scheduling/recurring";

interface Schedule {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
}

export default function RecurringScheduleClient({
  studentId,
  hasCoach,
  schedule,
}: {
  studentId: string;
  hasCoach: boolean;
  schedule: Schedule | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.dayOfWeek ?? 1);
  const [startTime, setStartTime] = useState(schedule?.startTime ?? "16:00");
  const [durationMinutes, setDurationMinutes] = useState(schedule?.durationMinutes ?? 30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/recurring-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, dayOfWeek, startTime, durationMinutes }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save the schedule.");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/recurring-schedule", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove the schedule.");
      return;
    }

    router.refresh();
  }

  if (!hasCoach) {
    return <p className="text-sm text-gray-500">Assign a coach before setting a weekly time.</p>;
  }

  if (!editing) {
    return (
      <div>
        {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
        {schedule ? (
          <div className="flex items-center gap-3 text-sm">
            <span>
              {DAY_NAMES[schedule.dayOfWeek]}s at{" "}
              {new Date(`2000-01-01T${schedule.startTime}`).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              ({schedule.durationMinutes} min)
            </span>
            <button onClick={() => setEditing(true)} className="text-blue-600 underline">
              Change
            </button>
            <button onClick={handleRemove} disabled={saving} className="text-red-600 underline">
              Remove
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-sm text-blue-600 underline">
            Set weekly schedule
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={dayOfWeek}
        onChange={(e) => setDayOfWeek(Number(e.target.value))}
        className="rounded border px-2 py-1"
      >
        {DAY_NAMES.map((name, i) => (
          <option key={i} value={i}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="time"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        className="rounded border px-2 py-1"
      />
      <select
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(Number(e.target.value))}
        className="rounded border px-2 py-1"
      >
        <option value={30}>30 min</option>
        <option value={60}>60 min</option>
      </select>
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setEditing(false)} disabled={saving} className="text-gray-500 underline">
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
