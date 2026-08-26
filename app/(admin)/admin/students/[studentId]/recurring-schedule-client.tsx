"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DAY_NAMES, nextWeeklySlotInstant } from "@/lib/scheduling/recurring";
import { formatTimeInZone } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { useTimeZone } from "@/components/timezone-context";
import styles from "../../../admin.module.css";

interface Schedule {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  startDate: string;
  coachId: string;
}

interface Coach {
  id: string;
  name: string;
}

// "Today" as a plain YYYY-MM-DD, anchored to the coach's own zone (the
// zone the schedule's day/time itself is defined in) rather than the
// browser's local zone or raw UTC — matters right at the coach's own
// day boundary, where UTC "today" can already be tomorrow.
function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export default function RecurringScheduleClient({
  studentId,
  hasCoach,
  defaultCoachId,
  coachTimeZone,
  coaches,
  schedule,
  hideStartPrompt = false,
}: {
  studentId: string;
  hasCoach: boolean;
  // The student's overall assigned coach — used as the default when
  // setting a brand new schedule. The schedule's own coach can be
  // changed independently afterward (a different coach covering this
  // student's regular slot) without touching the overall assignment.
  defaultCoachId: string | null;
  coachTimeZone: string | null;
  coaches: Coach[];
  schedule: Schedule | null;
  // The Start button in the subscription lifecycle bar above is now the
  // entry point for a student's first weekly schedule — this suppresses
  // this component's own "Set weekly schedule" link in that empty state
  // so there's only one place to do it, not two.
  hideStartPrompt?: boolean;
}) {
  const router = useRouter();
  const { timeZone: viewTimeZone } = useTimeZone();
  const effectiveCoachZone = coachTimeZone ?? DEFAULT_TIMEZONE;
  const today = todayInZone(effectiveCoachZone);

  const [editing, setEditing] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.dayOfWeek ?? 1);
  const [startTime, setStartTime] = useState(schedule?.startTime ?? "16:00");
  const [durationMinutes, setDurationMinutes] = useState(schedule?.durationMinutes ?? 30);
  const [coachId, setCoachId] = useState(schedule?.coachId ?? defaultCoachId ?? "");
  // Defaults to today for a brand new schedule (takes effect right
  // away); defaults to today for a change too, so by default a change
  // applies immediately unless the admin picks a future date — matching
  // how "Change" behaved before start_date existed.
  const [startDate, setStartDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/recurring-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        dayOfWeek,
        startTime,
        durationMinutes,
        startDate,
        coachId,
      }),
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
    return <p className={styles.mutedText}>Assign a coach before setting a weekly time.</p>;
  }

  if (!editing) {
    let scheduleLabel: ReactNode = null;
    if (schedule) {
      // start_time is wall-clock in the COACH's own zone — convert to a
      // real instant, then reformat in whatever zone the viewer has
      // selected (defaults to Eastern for admin), so the weekday and
      // time shown are actually correct for the viewer, not just the
      // coach's own raw numbers relabeled.
      const instant = nextWeeklySlotInstant(
        schedule.dayOfWeek,
        schedule.startTime,
        effectiveCoachZone,
      );
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: viewTimeZone,
        weekday: "long",
      }).format(instant);
      const coachName = coaches.find((c) => c.id === schedule.coachId)?.name;
      scheduleLabel = (
        <>
          {weekday}s at {formatTimeInZone(instant, viewTimeZone)} ({schedule.durationMinutes} min)
          {coachName ? ` with ${coachName}` : ""}
          {schedule.startDate > today ? ` — starting ${schedule.startDate}` : ""}
        </>
      );
    }

    return (
      <div>
        {error && <p className={styles.errorText} style={{ marginBottom: 4 }}>{error}</p>}
        {schedule ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span>{scheduleLabel}</span>
            <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
              Change
            </button>
            <button onClick={handleRemove} disabled={saving} className={styles.dangerLink}>
              Remove
            </button>
          </div>
        ) : hideStartPrompt ? (
          <p className={styles.mutedText}>Use Start above to set their first weekly session.</p>
        ) : (
          <button onClick={() => setEditing(true)} className={styles.linkBtn}>
            Set weekly schedule
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <select
        value={dayOfWeek}
        onChange={(e) => setDayOfWeek(Number(e.target.value))}
        className={styles.select}
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
        className={styles.input}
      />
      <span className={styles.mutedText}>({effectiveCoachZone.replace(/_/g, " ")})</span>
      <select
        value={coachId}
        onChange={(e) => setCoachId(e.target.value)}
        className={styles.select}
      >
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(Number(e.target.value))}
        className={styles.select}
      >
        <option value={30}>30 min</option>
        <option value={60}>60 min</option>
      </select>
      <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Starting
        <input
          type="date"
          value={startDate}
          min={today}
          onChange={(e) => setStartDate(e.target.value)}
          className={styles.inputSmall}
        />
      </label>
      <button
        onClick={handleSave}
        disabled={saving}
        className={styles.ctaSmall}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setEditing(false)} disabled={saving} className={styles.linkBtnSmall}>
        Cancel
      </button>
      {error && <p className={styles.errorText} style={{ width: "100%" }}>{error}</p>}
    </div>
  );
}
