"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DAY_NAMES, nextWeeklySlotInstant } from "@/lib/scheduling/recurring";
import { formatTimeInZone } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { useTimeZone } from "@/components/timezone-context";
import styles from "../../../admin.module.css";

interface Schedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  startDate: string;
  coachId: string;
  cadence: "weekly" | "biweekly";
}

interface Coach {
  id: string;
  name: string;
  timezone: string;
}

// "Today" as a plain YYYY-MM-DD, anchored to a coach's own zone (the
// zone the schedule's day/time itself is defined in) rather than the
// browser's local zone or raw UTC — matters right at the coach's own
// day boundary, where UTC "today" can already be tomorrow.
function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// A student can now have more than one weekly slot (migration 0076 —
// e.g. paying for 2x/week). This renders every existing slot with its
// own Change/Remove, plus an "Add another weekly slot" entry point —
// only one row is ever in edit mode at a time (editingId tracks which:
// an existing schedule's id, the sentinel "new", or null for none).
export default function RecurringScheduleClient({
  studentId,
  hasCoach,
  defaultCoachId,
  coaches,
  schedules,
  hideStartPrompt = false,
}: {
  studentId: string;
  hasCoach: boolean;
  // The student's overall assigned coach — used as the default when
  // adding a brand new slot. A slot's own coach can be changed
  // independently afterward (a different coach covering this student's
  // regular slot) without touching the overall assignment.
  defaultCoachId: string | null;
  coaches: Coach[];
  schedules: Schedule[];
  // The Start button in the subscription lifecycle bar above is the
  // entry point for a student's FIRST weekly schedule — this suppresses
  // this component's own "Set weekly schedule" link in the zero-schedule
  // empty state so there's only one place to do that, not two. Doesn't
  // affect adding a second/third slot once at least one already exists.
  hideStartPrompt?: boolean;
}) {
  const router = useRouter();
  const { timeZone: viewTimeZone } = useTimeZone();

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editingSchedule = typeof editingId === "string" && editingId !== "new" ? schedules.find((s) => s.id === editingId) ?? null : null;

  function zoneForCoach(coachId: string): string {
    return coaches.find((c) => c.id === coachId)?.timezone ?? DEFAULT_TIMEZONE;
  }

  const initialCoachId = editingSchedule?.coachId ?? defaultCoachId ?? coaches[0]?.id ?? "";
  const [dayOfWeek, setDayOfWeek] = useState(editingSchedule?.dayOfWeek ?? 1);
  const [startTime, setStartTime] = useState(editingSchedule?.startTime ?? "16:00");
  const [durationMinutes, setDurationMinutes] = useState(editingSchedule?.durationMinutes ?? 30);
  const [coachId, setCoachId] = useState(initialCoachId);
  const [cadence, setCadence] = useState<"weekly" | "biweekly">(editingSchedule?.cadence ?? "weekly");
  const effectiveCoachZone = zoneForCoach(coachId || initialCoachId);
  // Defaults to today — for a brand new slot that takes effect right
  // away, and for a change too, so by default a change applies
  // immediately unless the admin picks a future date.
  const [startDate, setStartDate] = useState(() => todayInZone(effectiveCoachZone));

  function startEditing(id: string | "new") {
    setError(null);
    const s = id === "new" ? null : schedules.find((sch) => sch.id === id) ?? null;
    setDayOfWeek(s?.dayOfWeek ?? 1);
    setStartTime(s?.startTime ?? "16:00");
    setDurationMinutes(s?.durationMinutes ?? 30);
    const zone = zoneForCoach(s?.coachId ?? defaultCoachId ?? coaches[0]?.id ?? "");
    setCoachId(s?.coachId ?? defaultCoachId ?? coaches[0]?.id ?? "");
    setCadence(s?.cadence ?? "weekly");
    setStartDate(s?.startDate && s.startDate > todayInZone(zone) ? s.startDate : todayInZone(zone));
    setEditingId(id);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/recurring-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        scheduleId: typeof editingId === "string" && editingId !== "new" ? editingId : undefined,
        dayOfWeek,
        startTime,
        durationMinutes,
        startDate,
        coachId,
        cadence,
      }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body.error ?? "Could not save the schedule.");
      return;
    }

    setEditingId(null);
    router.refresh();
  }

  async function handleRemove(scheduleId: string) {
    setRemovingId(scheduleId);
    setError(null);

    const res = await fetch("/api/admin/recurring-schedule", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId }),
    });

    setRemovingId(null);

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

  function labelFor(s: Schedule): ReactNode {
    const zone = zoneForCoach(s.coachId);
    // start_time is wall-clock in the slot's own coach's zone — convert
    // to a real instant, then reformat in whatever zone the viewer has
    // selected (defaults to Eastern for admin), so the weekday and time
    // shown are actually correct for the viewer, not just the coach's
    // own raw numbers relabeled.
    const instant = nextWeeklySlotInstant(s.dayOfWeek, s.startTime, zone);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: viewTimeZone, weekday: "long" }).format(instant);
    const coachName = coaches.find((c) => c.id === s.coachId)?.name;
    const today = todayInZone(zone);
    return (
      <>
        {weekday}s at {formatTimeInZone(instant, viewTimeZone)} ({s.durationMinutes} min)
        {coachName ? ` with ${coachName}` : ""}
        {s.cadence === "biweekly" ? " — biweekly" : ""}
        {s.startDate > today ? ` — starting ${s.startDate}` : ""}
      </>
    );
  }

  const addingNew = editingId === "new";

  return (
    <div>
      {error && <p className={styles.errorText} style={{ marginBottom: 8 }}>{error}</p>}

      {schedules.length === 0 && editingId === null ? (
        hideStartPrompt ? (
          <p className={styles.mutedText}>Use Start above to set their first weekly session.</p>
        ) : (
          <button onClick={() => startEditing("new")} className={styles.linkBtn}>
            Set weekly schedule
          </button>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schedules.map((s) =>
            editingId === s.id ? (
              <ScheduleForm
                key={s.id}
                coaches={coaches}
                dayOfWeek={dayOfWeek}
                setDayOfWeek={setDayOfWeek}
                startTime={startTime}
                setStartTime={setStartTime}
                durationMinutes={durationMinutes}
                setDurationMinutes={setDurationMinutes}
                coachId={coachId}
                setCoachId={setCoachId}
                cadence={cadence}
                setCadence={setCadence}
                startDate={startDate}
                setStartDate={setStartDate}
                today={todayInZone(effectiveCoachZone)}
                effectiveCoachZone={effectiveCoachZone}
                saving={saving}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span>{labelFor(s)}</span>
                <button onClick={() => startEditing(s.id)} className={styles.linkBtnSmall}>
                  Change
                </button>
                <button
                  onClick={() => handleRemove(s.id)}
                  disabled={removingId === s.id}
                  className={styles.dangerLink}
                >
                  {removingId === s.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ),
          )}

          {addingNew ? (
            <ScheduleForm
              coaches={coaches}
              dayOfWeek={dayOfWeek}
              setDayOfWeek={setDayOfWeek}
              startTime={startTime}
              setStartTime={setStartTime}
              durationMinutes={durationMinutes}
              setDurationMinutes={setDurationMinutes}
              coachId={coachId}
              setCoachId={setCoachId}
              cadence={cadence}
              setCadence={setCadence}
              startDate={startDate}
              setStartDate={setStartDate}
              today={todayInZone(effectiveCoachZone)}
              effectiveCoachZone={effectiveCoachZone}
              saving={saving}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            editingId === null && (
              <button onClick={() => startEditing("new")} className={styles.linkBtnSmall}>
                + Add another weekly slot
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleForm({
  coaches,
  dayOfWeek,
  setDayOfWeek,
  startTime,
  setStartTime,
  durationMinutes,
  setDurationMinutes,
  coachId,
  setCoachId,
  cadence,
  setCadence,
  startDate,
  setStartDate,
  today,
  effectiveCoachZone,
  saving,
  onSave,
  onCancel,
}: {
  coaches: Coach[];
  dayOfWeek: number;
  setDayOfWeek: (n: number) => void;
  startTime: string;
  setStartTime: (s: string) => void;
  durationMinutes: number;
  setDurationMinutes: (n: number) => void;
  coachId: string;
  setCoachId: (s: string) => void;
  cadence: "weekly" | "biweekly";
  setCadence: (c: "weekly" | "biweekly") => void;
  startDate: string;
  setStartDate: (s: string) => void;
  today: string;
  effectiveCoachZone: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={styles.select}>
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
      <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={styles.select}>
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
      <select
        value={cadence}
        onChange={(e) => setCadence(e.target.value as "weekly" | "biweekly")}
        className={styles.select}
      >
        <option value="weekly">Weekly</option>
        <option value="biweekly">Biweekly</option>
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
      <button onClick={onSave} disabled={saving} className={styles.ctaSmall}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={onCancel} disabled={saving} className={styles.linkBtnSmall}>
        Cancel
      </button>
    </div>
  );
}
