"use client";

import { useEffect, useState } from "react";
import { DAY_NAMES } from "@/lib/scheduling/recurring";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

const inputCls = "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--text)]";
const labelCls = "text-[11px] uppercase tracking-wide text-[var(--text-muted)]";

interface RecurringBlockRule {
  id: string;
  coachId: string | null;
  coachName: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  reason: string | null;
  startDate: string | null;
}

// Standing weekly time-off — Team Huddle for every coach, a specific
// coach's own recurring lunch/dinner break — as opposed to
// AddCoachBlockForm's one-off vacation/event blocks just above it in
// the same panel. Kept as its own separate form rather than a mode
// toggle on that one: its own comment already states a deliberate
// "always visible, nothing structurally different" simplicity for the
// one-off case, and a recurring rule genuinely has a different shape
// (day + time + duration, no end date) worth not cramming in there.
export default function AddRecurringCoachBlockForm({
  coachId,
  coachName,
  coachTimeZone,
  onAdded,
}: {
  coachId: string;
  coachName: string;
  coachTimeZone: string | null;
  onAdded: () => void;
}) {
  const [rules, setRules] = useState<RecurringBlockRule[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("12:00");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveTimeZone = applyToAll ? DEFAULT_TIMEZONE : (coachTimeZone ?? DEFAULT_TIMEZONE);

  function loadRules() {
    fetch(`/api/admin/recurring-coach-blocks?coachId=${coachId}`)
      .then((res) => res.json())
      .then((data) => setRules(data.rules ?? []));
  }

  useEffect(loadRules, [coachId]);

  async function handleAdd() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/recurring-coach-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coachId: applyToAll ? null : coachId,
        dayOfWeek,
        startTime,
        durationMinutes,
        timezone: effectiveTimeZone,
        reason: reason.trim() || null,
        startDate: startDate || null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't add that recurring time off.");
      return;
    }

    setReason("");
    setApplyToAll(false);
    setStartDate("");
    loadRules();
    onAdded();
  }

  async function handleStop(ruleId: string) {
    setStoppingId(ruleId);
    const res = await fetch(`/api/admin/recurring-coach-blocks?id=${ruleId}`, { method: "DELETE" });
    setStoppingId(null);
    if (res.ok) {
      loadRules();
      onAdded();
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Recurring time off
      </h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="rblock-day" className={labelCls}>
            Day
          </label>
          <select
            id="rblock-day"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className={inputCls}
          >
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="rblock-time" className={labelCls}>
            Start time ({effectiveTimeZone.replace(/_/g, " ")})
          </label>
          <input
            id="rblock-time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="rblock-duration" className={labelCls}>
            Duration (min)
          </label>
          <input
            id="rblock-duration"
            type="number"
            min={5}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className={`w-20 ${inputCls}`}
          />
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <label htmlFor="rblock-reason" className={labelCls}>
            Reason
          </label>
          <input
            id="rblock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Team Huddle, Lunch"
            className={`w-full ${inputCls} placeholder:text-[var(--text-muted)]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="rblock-start-date" className={labelCls}>
            Starts on
          </label>
          <input
            id="rblock-start-date"
            type="date"
            value={startDate}
            min={today}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
          All coaches
        </label>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--gold-text)] disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {!applyToAll && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">Applies only to {coachName} unless "All coaches" is checked.</p>
      )}
      <p className="mt-1 text-xs text-[var(--text-muted)]">Leave "Starts on" blank to begin right away.</p>
      {error && <p className="mt-2 text-sm text-[var(--coral)]">{error}</p>}

      {rules.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-[var(--border)] pt-4">
          {rules.map((r) => {
            const startsInFuture = r.startDate && r.startDate > today;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Every {DAY_NAMES[r.dayOfWeek]} at {r.startTime} ({r.timezone.replace(/_/g, " ")}) ·{" "}
                  {r.durationMinutes} min ·{" "}
                  <span className="text-[var(--text-muted)]">
                    {r.coachId ? r.coachName : "All coaches"}
                    {r.reason ? ` — ${r.reason}` : ""}
                    {startsInFuture ? ` (starts ${r.startDate})` : ""}
                  </span>
                </span>
                <button
                  onClick={() => handleStop(r.id)}
                  disabled={stoppingId === r.id}
                  className="text-xs text-[var(--coral)] underline"
                >
                  {stoppingId === r.id ? "Stopping…" : "Stop"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
