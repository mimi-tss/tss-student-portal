"use client";

import { useEffect, useState } from "react";

const inputCls = "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--text)]";
const labelCls = "text-[11px] uppercase tracking-wide text-[var(--text-muted)]";

interface CoachBlock {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

function formatRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${start.toLocaleDateString(undefined, dateOpts)} ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleDateString(undefined, dateOpts)} ${end.toLocaleTimeString(undefined, timeOpts)}`;
}

// Time-off / vacation block form — shared by the admin Scheduler page
// (one coach at a time) and the Coaches page (day-view across all
// coaches). Posts to the same /api/admin/coach-blocks either way; a
// vacation is just a block with a longer start/end span and a reason
// like "Vacation", nothing structurally different from a short one.
//
// Start/End, each split into a date + a time field, both always visible
// — a <input type="date"> gets a real native calendar popup (the whole
// point of splitting it out of datetime-local), and always showing the
// time fields means picking a specific window (not just a day) never
// needs a hidden toggle first.
export default function AddCoachBlockForm({
  coachId,
  coachName,
  onAdded,
}: {
  coachId: string;
  coachName: string;
  onAdded: () => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<CoachBlock[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function loadBlocks() {
    fetch(`/api/admin/coach-blocks?coachId=${coachId}`)
      .then((res) => res.json())
      .then((data) => setBlocks(data.blocks ?? []));
  }

  useEffect(loadBlocks, [coachId]);

  async function handleRemove(id: string) {
    setRemovingId(id);
    const res = await fetch(`/api/admin/coach-blocks?id=${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (res.ok) {
      loadBlocks();
      onAdded();
    }
  }

  async function handleAdd() {
    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }
    const startAt = new Date(`${startDate}T${startTime}`);
    const endAt = new Date(`${endDate}T${endTime}`);
    if (endAt <= startAt) {
      setError("End must be after start.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/coach-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coachId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason: reason.trim() || null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't add that time off.");
      return;
    }

    setStartDate("");
    setEndDate("");
    setReason("");
    loadBlocks();
    onAdded();
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Add time off for {coachName}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="block-start-date" className={labelCls}>
            Start date
          </label>
          <input
            id="block-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="block-start-time" className={labelCls}>
            Start time
          </label>
          <input
            id="block-start-time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="block-end-date" className={labelCls}>
            End date
          </label>
          <input
            id="block-end-date"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="block-end-time" className={labelCls}>
            End time
          </label>
          <input
            id="block-end-time"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <label htmlFor="block-reason" className={labelCls}>
            Reason
          </label>
          <input
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Vacation, Event, Meeting, Break"
            className={`w-full ${inputCls} placeholder:text-[var(--text-muted)]`}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--gold-text)] disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[var(--coral)]">{error}</p>}

      {blocks.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-[var(--border)] pt-4">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {formatRange(b.startAt, b.endAt)}
                {b.reason ? <span className="text-[var(--text-muted)]"> — {b.reason}</span> : ""}
              </span>
              <button
                onClick={() => handleRemove(b.id)}
                disabled={removingId === b.id}
                className="text-xs text-[var(--coral)] underline"
              >
                {removingId === b.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
