"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  zonedTimeToUtc,
  zonedHourMinute,
  zonedDayKey,
  zonedYearMonthDay,
  timezoneAbbreviation,
  formatDateInZone,
} from "@/lib/timezone";
import { allTimezones, timezoneLabel, DEFAULT_TIMEZONE } from "@/lib/timezones";
import { isHolidayInstant } from "@/lib/scheduling/holidays";
import { useTimeZone } from "@/components/timezone-context";
import { FormattedDateTime } from "@/components/formatted-time";
import AddCoachBlockForm from "@/components/add-coach-block-form";
import AddRecurringCoachBlockForm from "@/components/add-recurring-coach-block-form";
import CoachCalendar from "@/components/coach-calendar";
import AdminCancelButtons from "../students/[studentId]/admin-cancel-buttons";
import { formatPlainDate } from "@/lib/format-date";
import styles from "../../admin.module.css";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday",
};
const SLOT_MINUTES = 30;
const DEFAULT_ROW_START_MIN = 7 * 60; // 7:00 AM — only used when nobody visible has any working hours set yet
const DEFAULT_ROW_END_MIN = 20 * 60; // 8:00 PM

interface CoachRow {
  id: string;
  name: string;
  email: string;
  timezone: string;
  hiddenFromStudents: boolean;
  workingHours: Record<string, [string, string][]>;
  pendingWorkingHours: Record<string, [string, string][]> | null;
  pendingEffectiveDate: string | null;
  studentCount: number;
  active: boolean;
  meetLink: string | null;
}

interface Session {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  isTrial: boolean;
  isMakeup: boolean;
  studentId: string;
  studentName: string;
}
interface Block {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
}
interface GroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  attendees: { studentId: string; studentName: string }[];
}
interface HeldSlot {
  scheduledAt: string;
  durationMinutes: number;
  studentName: string;
}
interface CoachDaySchedule {
  coach: { id: string; name: string; workingHours: Record<string, [string, string][]>; timezone: string };
  blocks: Block[];
  sessions: Session[];
  groupLessons: GroupLesson[];
  heldSlots: HeldSlot[];
}

interface CreditOption {
  id: string;
  type: string;
  durationMinutes: number | null;
  expiresAt: string | null;
}
interface StudentWithCredits {
  studentId: string;
  studentName: string;
  credits: CreditOption[];
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDaysToKey(key: string, delta: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}
function startOfWeekKey(key: string): string {
  const d = parseDateKey(key);
  return addDaysToKey(key, -d.getDay());
}
function fmtTimeLabel(minutesFromMidnight: number) {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

type CellState =
  | { type: "blank" }
  | { type: "available" }
  | { type: "session"; session: Session; isStart: boolean }
  | { type: "group"; groupLesson: GroupLesson; isStart: boolean }
  | { type: "held"; reason: string; isStart: boolean }
  | { type: "block"; block: Block; isStart: boolean };

export default function AllCoachesDayClient({ coaches }: { coaches: CoachRow[] }) {
  const router = useRouter();
  const { timeZone: displayTimeZone } = useTimeZone();
  const gridTimeZone = displayTimeZone ?? "America/New_York";
  const activeCoaches = coaches.filter((c) => c.active);

  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const [schedules, setSchedules] = useState<CoachDaySchedule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [holidays, setHolidays] = useState<{ date: string; label: string | null }[]>([]);

  // Studio-wide closure dates (studio_holidays, migration 0055) — one
  // fetch on mount, same as CoachCalendar's own copy of this.
  useEffect(() => {
    fetch("/api/admin/studio-holidays")
      .then((res) => res.json())
      .then((body) => setHolidays(body.holidays ?? []))
      .catch(() => {});
  }, []);
  const holidayDates = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const holidayLabelByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h.label])), [holidays]);

  // Empty set = "All coaches". Otherwise an arbitrary multi-coach
  // selection — Day view renders however many columns that is side by
  // side, since the grid already just renders whatever schedules array
  // it's given. Week view only makes sense (and is only offered) once
  // narrowed to exactly one coach — a week-per-coach-column grid would
  // need coaches × 7 columns, unreadable past one.
  const [selectedCoachIds, setSelectedCoachIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"day" | "week">("day");
  const [weekRange, setWeekRange] = useState<{ start: Date; end: Date } | null>(null);

  // Roster table defaults to active-only — an inactive coach is
  // deliberately kept forever (0042's "never a hard delete"), so without
  // this the table would only ever grow, cluttered with people no
  // longer teaching. Independent of activeCoaches above, which only
  // feeds the day-schedule coach picker.
  const [showInactiveCoaches, setShowInactiveCoaches] = useState(false);
  const rosterCoaches = showInactiveCoaches ? coaches : coaches.filter((c) => c.active);

  function toggleCoach(id: string) {
    const next = new Set(selectedCoachIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCoachIds(next);
    if (next.size !== 1) setView("day");
  }
  function clearCoachSelection() {
    setSelectedCoachIds(new Set());
    setView("day");
  }

  // Which "mode" panel is open below the grid, if any.
  const [panel, setPanel] = useState<
    | null
    | { kind: "book"; coachId: string; coachName: string; slotStart: Date }
    | { kind: "block"; coachId: string; coachName: string; slotStart: Date }
    | { kind: "availability"; coachId: string; coachName: string }
    | { kind: "timeoff"; coachId: string; coachName: string }
    | { kind: "addCoach" }
    | { kind: "studioHolidays" }
    | {
        kind: "editCoach";
        coachId: string;
        name: string;
        email: string;
        timezone: string;
        hiddenFromStudents: boolean;
        meetLink: string | null;
        workingHours: Record<string, [string, string][]>;
        pendingEffectiveDate: string | null;
      }
    | { kind: "cancel"; sessionId: string; studentId: string; studentName: string; scheduledAt: string; isMakeup: boolean }
    | { kind: "cancelGroup"; groupLessonId: string; topic: string | null; scheduledAt: string }
  >(null);

  // Callable directly (not just via the refreshTick-bump indirection) so
  // an action panel can await the fresh grid before it closes — the
  // previous tick-and-hope approach left a visible gap where the panel
  // was already gone but the grid hadn't caught up yet, which read as
  // "booking/cancelling doesn't show up right away."
  const refetchSchedules = useCallback(async () => {
    const start = parseDateKey(dateKey);
    const end = addDaysToKey(dateKey, 1);
    const res = await fetch(
      `/api/admin/all-coaches-day?start=${start.toISOString()}&end=${parseDateKey(end).toISOString()}`,
    );
    const body = await res.json();
    setSchedules(body.coaches ?? []);
  }, [dateKey]);

  useEffect(() => {
    // Only the very first load (or a date change) shows "Loading…" — a
    // background refresh keeps the last-good grid on screen instead of
    // blanking it, which made every refresh look like data had vanished.
    if (schedules === null) setLoading(true);
    refetchSchedules().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, refreshTick]);

  const [metrics, setMetrics] = useState<{
    attendedCount: number;
    noShowCount: number;
    dncStudentCount: number;
    utilizationPct: number;
  } | null>(null);

  // Metrics track whatever's actually on screen: the day-view's date for
  // Day, or CoachCalendar's own reported range for Week (that range lives
  // inside CoachCalendar's private anchorKey state, surfaced via
  // onRangeChange below — same pattern My Schedule's payroll summary
  // uses). Re-fetches whenever the visible range or coach selection moves.
  const metricsRange = view === "week" ? weekRange : { start: parseDateKey(dateKey), end: parseDateKey(addDaysToKey(dateKey, 1)) };
  useEffect(() => {
    if (!metricsRange) return;
    const coachIdsParam = selectedCoachIds.size > 0 ? Array.from(selectedCoachIds).join(",") : "";
    const params = new URLSearchParams({
      start: metricsRange.start.toISOString(),
      end: metricsRange.end.toISOString(),
    });
    if (coachIdsParam) params.set("coachIds", coachIdsParam);
    fetch(`/api/admin/coach-metrics?${params.toString()}`)
      .then((res) => res.json())
      .then(setMetrics);
  }, [metricsRange?.start.getTime(), metricsRange?.end.getTime(), selectedCoachIds, refreshTick]);

  const visibleSchedules =
    selectedCoachIds.size > 0 ? (schedules ?? []).filter((s) => selectedCoachIds.has(s.coach.id)) : schedules;

  // Rows span each visible coach's *whole week* of configured hours
  // (earliest start, latest end across all seven days), not just
  // whatever today happens to be — same computation
  // components/coach-calendar.tsx uses for Day and Week alike, so a
  // coach's grid looks the same regardless of which of the three views
  // (this one, or CoachCalendar's Day/Week) is showing it, and doesn't
  // jump around as admin clicks through different dates. Falls back to a
  // sane default range only when nobody visible has any working hours
  // set yet, so a freshly-provisioned coach doesn't render an empty
  // 24-row grid.
  const { rowStartMin, rowEndMin } = useMemo(() => {
    let min = DEFAULT_ROW_START_MIN;
    let max = DEFAULT_ROW_END_MIN;
    let found = false;
    const weekStart = startOfWeekKey(dateKey);
    for (const s of visibleSchedules ?? []) {
      for (let dow = 0; dow < 7; dow++) {
        const refKey = addDaysToKey(weekStart, dow);
        const windows = s.coach.workingHours?.[DAY_KEYS[dow]] ?? [];
        if (windows.length === 0) continue;
        const d = parseDateKey(refKey);
        for (const [start, end] of windows) {
          const [sh, sm] = start.split(":").map(Number);
          const [eh, em] = end.split(":").map(Number);
          const startInstant = zonedTimeToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), sh, sm, s.coach.timezone);
          const endInstant = zonedTimeToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), eh, em, s.coach.timezone);
          const [gsh, gsm] = zonedHourMinute(startInstant, gridTimeZone);
          const [geh, gem] = zonedHourMinute(endInstant, gridTimeZone);
          const gStart = gsh * 60 + gsm;
          const gEnd = geh === 0 && gem === 0 ? 24 * 60 : geh * 60 + gem;
          if (!found) {
            min = gStart;
            max = gEnd;
            found = true;
          } else {
            min = Math.min(min, gStart);
            max = Math.max(max, gEnd);
          }
        }
      }
    }
    if (!found) return { rowStartMin: DEFAULT_ROW_START_MIN, rowEndMin: DEFAULT_ROW_END_MIN };
    return { rowStartMin: Math.max(0, min - 30), rowEndMin: Math.min(24 * 60, max + 30) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSchedules, dateKey, gridTimeZone]);

  const rows: number[] = [];
  for (let m = rowStartMin; m < rowEndMin; m += SLOT_MINUTES) rows.push(m);

  function cellState(schedule: CoachDaySchedule, minutesFromMidnight: number): CellState {
    const d = parseDateKey(dateKey);
    const hour = Math.floor(minutesFromMidnight / 60);
    const minute = minutesFromMidnight % 60;
    const slotStart = zonedTimeToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), hour, minute, gridTimeZone);
    const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60 * 1000);

    const coachDow = zonedDayKey(slotStart, schedule.coach.timezone);
    const [coachHour, coachMinute] = zonedHourMinute(slotStart, schedule.coach.timezone);
    const coachMinutes = coachHour * 60 + coachMinute;
    const windows = schedule.coach.workingHours?.[coachDow] ?? [];
    const inWorkingHours = windows.some(([start, end]) => {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      return coachMinutes >= sh * 60 + sm && coachMinutes < eh * 60 + em;
    });
    if (!inWorkingHours) return { type: "blank" };

    const group = schedule.groupLessons.find((g) => {
      const gStart = new Date(g.scheduledAt);
      const gEnd = new Date(gStart.getTime() + g.durationMinutes * 60 * 1000);
      return slotStart < gEnd && slotEnd > gStart;
    });
    if (group) return { type: "group", groupLesson: group, isStart: slotStart.getTime() === new Date(group.scheduledAt).getTime() };

    const session = schedule.sessions.find((s) => {
      const sStart = new Date(s.scheduledAt);
      const sEnd = new Date(sStart.getTime() + s.durationMinutes * 60 * 1000);
      return slotStart < sEnd && slotEnd > sStart;
    });
    if (session) {
      const isStart = slotStart.getTime() === new Date(session.scheduledAt).getTime();
      if (session.status === "cancelled-no-notice" || session.status === "paused" || session.status === "holiday") {
        return {
          type: "held",
          reason:
            session.status === "paused"
              ? `Reserved — ${session.studentName} (paused)`
              : session.status === "holiday"
                ? `Studio holiday — ${session.studentName}`
                : `Late cancel — ${session.studentName}`,
          isStart,
        };
      }
      return { type: "session", session, isStart };
    }

    const held = schedule.heldSlots.find((h) => {
      const hStart = new Date(h.scheduledAt);
      const hEnd = new Date(hStart.getTime() + h.durationMinutes * 60 * 1000);
      return slotStart < hEnd && slotEnd > hStart;
    });
    if (held) {
      return { type: "held", reason: `Reserved — ${held.studentName} (paused)`, isStart: slotStart.getTime() === new Date(held.scheduledAt).getTime() };
    }

    const block = schedule.blocks.find((b) => {
      const bStart = new Date(b.start_at);
      const bEnd = new Date(b.end_at);
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (block) return { type: "block", block, isStart: slotStart.getTime() === new Date(block.start_at).getTime() };

    // Studio-wide closure (studio_holidays, migration 0055) — same
    // fallback-only placement and synthesized Block as CoachCalendar's
    // own copy of this check: a forfeited session already renders via
    // the "held" branch above, this only fires for an otherwise-open slot.
    if (holidayDates.size > 0 && isHolidayInstant(slotStart, holidayDates)) {
      const [hy, hm, hd] = zonedYearMonthDay(slotStart, "America/New_York");
      const holidayKey = `${hy}-${String(hm).padStart(2, "0")}-${String(hd).padStart(2, "0")}`;
      const label = holidayLabelByDate.get(holidayKey);
      const earliestWindowStart = windows.reduce<number | null>((min, [s]) => {
        const [sh, sm] = s.split(":").map(Number);
        const mins = sh * 60 + sm;
        return min === null || mins < min ? mins : min;
      }, null);
      return {
        type: "block",
        block: { id: "holiday", start_at: "", end_at: "", reason: `Studio holiday${label ? ` — ${label}` : ""}` },
        isStart: earliestWindowStart !== null && coachMinutes === earliestWindowStart,
      };
    }

    return { type: "available" };
  }

  function slotStartFor(minutesFromMidnight: number) {
    const d = parseDateKey(dateKey);
    const hour = Math.floor(minutesFromMidnight / 60);
    const minute = minutesFromMidnight % 60;
    return zonedTimeToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), hour, minute, gridTimeZone);
  }

  const dateLabel = parseDateKey(dateKey).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  // Only meaningful (and only used) once exactly one coach is selected —
  // Week mode and the per-coach availability/time-off shortcuts in the
  // header both key off this.
  const soloCoachId = selectedCoachIds.size === 1 ? Array.from(selectedCoachIds)[0] : null;
  const selectedCoach = soloCoachId ? coaches.find((c) => c.id === soloCoachId) : null;

  const metricsScopeLabel =
    selectedCoachIds.size === 0
      ? "All coaches"
      : selectedCoachIds.size === 1
        ? selectedCoach?.name ?? "1 coach"
        : `${selectedCoachIds.size} coaches`;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <button
          onClick={clearCoachSelection}
          className={`${styles.lifecycleBtn} ${selectedCoachIds.size === 0 ? styles.lifecycleBtnActive : ""}`}
          style={{ flex: "0 1 auto" }}
        >
          All coaches
        </button>
        {activeCoaches.map((c) => (
          <button
            key={c.id}
            onClick={() => toggleCoach(c.id)}
            className={`${styles.lifecycleBtn} ${selectedCoachIds.has(c.id) ? styles.lifecycleBtnActive : ""}`}
            style={{ flex: "0 1 auto" }}
            title="Click to toggle — pick as many coaches as you want to compare side by side"
          >
            {c.name}
          </button>
        ))}
        <button
          onClick={() => setPanel({ kind: "addCoach" })}
          className={styles.linkBtnSmall}
          style={{ flex: "0 1 auto", marginLeft: 4 }}
        >
          + Add coach
        </button>
        <button
          onClick={() => setPanel({ kind: "studioHolidays" })}
          className={styles.linkBtnSmall}
          style={{ flex: "0 1 auto" }}
        >
          Studio holidays
        </button>
      </div>

      <div className={styles.pageHeadRow} style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {view === "day" ? (
              <>
                {dateLabel}{" "}
                <span className={styles.mutedText} style={{ fontWeight: 400, fontSize: 13 }}>
                  ({timezoneAbbreviation(gridTimeZone)})
                </span>
              </>
            ) : (
              <>{selectedCoach?.name}&apos;s week</>
            )}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {soloCoachId && (
            <>
              <button
                onClick={() => setView("day")}
                className={`${styles.lifecycleBtn} ${view === "day" ? styles.lifecycleBtnActive : ""}`}
              >
                Day
              </button>
              <button
                onClick={() => setView("week")}
                className={`${styles.lifecycleBtn} ${view === "week" ? styles.lifecycleBtnActive : ""}`}
              >
                Week
              </button>
            </>
          )}
          {view === "day" && (
            <>
              <button className={styles.btnGhost} onClick={() => setDateKey(addDaysToKey(dateKey, -1))}>←</button>
              <button className={styles.btnGhost} onClick={() => setDateKey(toDateKey(new Date()))}>Today</button>
              <button className={styles.btnGhost} onClick={() => setDateKey(addDaysToKey(dateKey, 1))}>→</button>
            </>
          )}
        </div>
      </div>

      {view === "week" && soloCoachId && selectedCoach && (
        <div className={styles.panel}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <button
              className={styles.linkBtnSmall}
              onClick={() => setPanel({ kind: "availability", coachId: selectedCoach.id, coachName: selectedCoach.name })}
            >
              Edit availability
            </button>
            <button
              className={styles.linkBtnSmall}
              onClick={() => setPanel({ kind: "timeoff", coachId: selectedCoach.id, coachName: selectedCoach.name })}
            >
              Add time off
            </button>
          </div>
          <CoachCalendar
            scheduleEndpoint={`/api/admin/coach-schedule?coachId=${soloCoachId}`}
            studentLinkBase="/admin/students"
            refreshSignal={refreshTick}
            onRangeChange={(start, end) => setWeekRange({ start, end })}
            onAvailableSlotClick={(slotStart) =>
              setPanel({ kind: "book", coachId: selectedCoach.id, coachName: selectedCoach.name, slotStart })
            }
            onSessionCancelClick={(session) =>
              setPanel({
                kind: "cancel",
                sessionId: session.id,
                studentId: session.studentId,
                studentName: session.studentName,
                scheduledAt: session.scheduledAt,
                isMakeup: session.isMakeup,
              })
            }
            onGroupLessonCancelClick={(groupLesson) =>
              setPanel({ kind: "cancelGroup", groupLessonId: groupLesson.id, topic: groupLesson.topic, scheduledAt: groupLesson.scheduledAt })
            }
          />
        </div>
      )}

      {view === "day" && (
      <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
        <span><span style={legendDotStyle("var(--slot-open)")} />Available</span>
        <span><span style={legendDotStyle("var(--gold)")} />Scheduled</span>
        <span><span style={legendDotStyle("var(--slot-trial)")} />Trial lesson</span>
        <span><span style={legendDotStyle("var(--slot-group)")} />Group lesson</span>
        <span><span style={legendDotStyle("var(--slot-blocked)", true)} />Blocked</span>
        <span><span style={legendDotStyle("var(--slot-held)")} />Held (no booking)</span>
        <span className={styles.mutedText}>Click an open slot to book with a makeup credit or add a block</span>
      </div>

      {loading && schedules === null && <p className={styles.mutedText}>Loading…</p>}

      {visibleSchedules && (
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 560, border: "1px solid var(--border)", borderRadius: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `80px repeat(${visibleSchedules.length}, minmax(150px, 1fr))`,
              fontSize: 11,
            }}
          >
            <div />
            {visibleSchedules.map((s) => (
              <div key={s.coach.id} style={{ borderBottom: "1px solid var(--border)", padding: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.coach.name}</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                  <button
                    className={styles.linkBtnSmall}
                    onClick={() => setPanel({ kind: "availability", coachId: s.coach.id, coachName: s.coach.name })}
                  >
                    Availability
                  </button>
                  <button
                    className={styles.linkBtnSmall}
                    onClick={() => setPanel({ kind: "timeoff", coachId: s.coach.id, coachName: s.coach.name })}
                  >
                    Time off
                  </button>
                </div>
              </div>
            ))}

            {rows.map((min) => (
              <div key={min} style={{ display: "contents" }}>
                <div style={{ borderRight: "1px solid var(--border)", padding: 4, textAlign: "right", color: "var(--text-muted)" }}>
                  {fmtTimeLabel(min)}
                </div>
                {visibleSchedules.map((s) => {
                  const state = cellState(s, min);
                  const cancellable = state.type === "session" && state.session.status === "scheduled";
                  const groupCancellable = state.type === "group";
                  const clickable = state.type === "available" || cancellable || groupCancellable;
                  const bg =
                    state.type === "available" ? "var(--slot-open)"
                    : state.type === "group" ? "var(--slot-group)"
                    : state.type === "held" ? "var(--slot-held)"
                    : state.type === "session" ? (state.session.isTrial ? "var(--slot-trial)" : "var(--gold)")
                    : state.type === "block" ? "var(--slot-blocked)"
                    : "var(--bg)";
                  const fg =
                    state.type === "available" ? "var(--text-muted)"
                    : state.type === "group" ? "var(--slot-group-text)"
                    : state.type === "held" ? "var(--slot-held-text)"
                    : state.type === "session" ? (state.session.isTrial ? "var(--slot-trial-text)" : "var(--gold-text)")
                    : "var(--text-muted)";
                  const label =
                    state.type === "session" && state.isStart ? (
                      <Link
                        href={`/admin/students/${state.session.studentId}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: "inherit", textDecoration: "underline" }}
                      >
                        {state.session.studentName}
                      </Link>
                    )
                    : state.type === "group" && state.isStart ? `${state.groupLesson.topic || "Group"} (${state.groupLesson.attendees.length})`
                    : state.type === "held" && state.isStart ? state.reason
                    : state.type === "block" && state.isStart ? (state.block.reason || "Blocked")
                    : "";
                  const title =
                    state.type === "session" ? `${state.session.studentName} — ${state.session.status}${cancellable ? " — click to cancel" : ""}`
                    : state.type === "group" ? `${state.groupLesson.topic || "Group Lesson"} — ${state.groupLesson.attendees.length} students — click to cancel`
                    : state.type === "held" ? state.reason
                    : state.type === "block" ? (state.block.reason ?? "Blocked")
                    : undefined;

                  return (
                    <div
                      key={s.coach.id + min}
                      title={title}
                      onClick={
                        state.type === "available"
                          ? () =>
                              setPanel({
                                kind: "book",
                                coachId: s.coach.id,
                                coachName: s.coach.name,
                                slotStart: slotStartFor(min),
                              })
                          : cancellable
                            ? () =>
                                setPanel({
                                  kind: "cancel",
                                  sessionId: state.session.id,
                                  studentId: state.session.studentId,
                                  studentName: state.session.studentName,
                                  scheduledAt: state.session.scheduledAt,
                                  isMakeup: state.session.isMakeup,
                                })
                            : groupCancellable
                              ? () =>
                                  setPanel({
                                    kind: "cancelGroup",
                                    groupLessonId: state.groupLesson.id,
                                    topic: state.groupLesson.topic,
                                    scheduledAt: state.groupLesson.scheduledAt,
                                  })
                              : undefined
                      }
                      style={{
                        height: 24,
                        display: "flex",
                        alignItems: "center",
                        overflow: "hidden",
                        borderBottom: "1px solid var(--border)",
                        borderRight: "1px solid var(--border)",
                        padding: "0 4px",
                        fontSize: 10,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        background: bg,
                        color: fg,
                        cursor: clickable ? "pointer" : "default",
                        border: state.type === "block" ? "1px solid var(--border)" : undefined,
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      <div style={{ height: 8 }} />
      <div className={styles.panel}>
        <div className={styles.pageHeadRow} style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Metrics</h2>
          <span className={styles.mutedText} style={{ fontSize: 12 }}>
            {view === "week" ? "This week" : dateKey === toDateKey(new Date()) ? "Today" : "This day"} — {metricsScopeLabel}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <MetricBox label="Attended" value={metrics ? String(metrics.attendedCount) : "—"} />
          <MetricBox label="No-shows" value={metrics ? String(metrics.noShowCount) : "—"} />
          <MetricBox label="DNC students seen" value={metrics ? String(metrics.dncStudentCount) : "—"} />
          <MetricBox label="Schedule utilization" value={metrics ? `${metrics.utilizationPct}%` : "—"} />
        </div>
      </div>

      {panel?.kind === "book" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <BookWithCreditPanel
            coachId={panel.coachId}
            coachName={panel.coachName}
            slotStart={panel.slotStart}
            onSwitchToBlock={() => setPanel({ kind: "block", coachId: panel.coachId, coachName: panel.coachName, slotStart: panel.slotStart })}
            onClose={() => setPanel(null)}
            onDone={async () => {
              await refetchSchedules();
              setPanel(null);
              // Also bumps CoachCalendar's refreshSignal (Week mode has
              // its own independent fetch, untouched by refetchSchedules
              // above) — needed now that booking/cancelling can happen
              // from Week's grid too, not just Day's.
              setRefreshTick((t) => t + 1);
            }}
          />
        </ModalOverlay>
      )}

      {panel?.kind === "block" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <QuickBlockPanel
            coachId={panel.coachId}
            coachName={panel.coachName}
            slotStart={panel.slotStart}
            onClose={() => setPanel(null)}
            onDone={async () => {
              await refetchSchedules();
              setPanel(null);
              // Also bumps CoachCalendar's refreshSignal (Week mode has
              // its own independent fetch, untouched by refetchSchedules
              // above) — needed now that booking/cancelling can happen
              // from Week's grid too, not just Day's.
              setRefreshTick((t) => t + 1);
            }}
          />
        </ModalOverlay>
      )}

      {panel?.kind === "availability" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <AvailabilityPanel
            coachId={panel.coachId}
            coachName={panel.coachName}
            initialWorkingHours={coaches.find((c) => c.id === panel.coachId)?.workingHours ?? {}}
            pendingWorkingHours={coaches.find((c) => c.id === panel.coachId)?.pendingWorkingHours ?? null}
            pendingEffectiveDate={coaches.find((c) => c.id === panel.coachId)?.pendingEffectiveDate ?? null}
            onClose={() => setPanel(null)}
            onSaved={(savedHours, isImmediate) => {
              // Only patch today's grid when the change is immediate — a
              // future-dated change shouldn't touch what's showing right
              // now, that's the whole point of picking a later date.
              // Either way this is synchronous, so there's no gap where
              // the panel's closed but the change isn't visible yet. The
              // refetch/refresh below still runs to reconcile with the
              // server in the background.
              if (isImmediate) {
                setSchedules((prev) =>
                  prev
                    ? prev.map((s) =>
                        s.coach.id === panel.coachId
                          ? { ...s, coach: { ...s.coach, workingHours: savedHours } }
                          : s,
                      )
                    : prev,
                );
              }
              setPanel(null);
              refetchSchedules();
              setRefreshTick((t) => t + 1);
              router.refresh();
            }}
          />
        </ModalOverlay>
      )}

      {panel?.kind === "timeoff" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <div className={styles.panel}>
            <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>Time off</h2>
              <button className={styles.linkBtnSmall} onClick={() => setPanel(null)}>Close</button>
            </div>
            <AddCoachBlockForm
              coachId={panel.coachId}
              coachName={panel.coachName}
              onAdded={refetchSchedules}
            />
            <AddRecurringCoachBlockForm
              coachId={panel.coachId}
              coachName={panel.coachName}
              coachTimeZone={coaches.find((c) => c.id === panel.coachId)?.timezone ?? null}
              onAdded={refetchSchedules}
            />
          </div>
        </ModalOverlay>
      )}

      {panel?.kind === "cancel" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <CancelSessionPanel
            sessionId={panel.sessionId}
            studentId={panel.studentId}
            studentName={panel.studentName}
            scheduledAt={panel.scheduledAt}
            isMakeup={panel.isMakeup}
            onClose={() => setPanel(null)}
            onDone={async () => {
              await refetchSchedules();
              setPanel(null);
              // Also bumps CoachCalendar's refreshSignal (Week mode has
              // its own independent fetch, untouched by refetchSchedules
              // above) — needed now that booking/cancelling can happen
              // from Week's grid too, not just Day's.
              setRefreshTick((t) => t + 1);
            }}
          />
        </ModalOverlay>
      )}

      {panel?.kind === "cancelGroup" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <CancelGroupLessonPanel
            groupLessonId={panel.groupLessonId}
            topic={panel.topic}
            scheduledAt={panel.scheduledAt}
            onClose={() => setPanel(null)}
            onDone={async () => {
              await refetchSchedules();
              setPanel(null);
              // Also bumps CoachCalendar's refreshSignal (Week mode has
              // its own independent fetch, untouched by refetchSchedules
              // above) — needed now that booking/cancelling can happen
              // from Week's grid too, not just Day's.
              setRefreshTick((t) => t + 1);
            }}
          />
        </ModalOverlay>
      )}

      <div className={styles.panel} style={{ marginTop: 20 }}>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showInactiveCoaches}
            onChange={(e) => setShowInactiveCoaches(e.target.checked)}
          />
          Show inactive coaches
        </label>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Timezone</th>
              <th>Students</th>
              <th>Visibility</th>
              <th>Status</th>
              <th>Meeting link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rosterCoaches.map((c) => (
              <tr key={c.id}>
                <td className={styles.rowName}>{c.name}</td>
                <td className={styles.mutedText}>{c.email}</td>
                <td className={styles.mutedText}>{c.timezone?.replace(/_/g, " ") ?? "—"}</td>
                <td className={styles.mutedText}>{c.studentCount}</td>
                <td>
                  {c.hiddenFromStudents ? (
                    <span className={styles.badgeMuted}>Hidden from trial picker</span>
                  ) : (
                    <span className={styles.mutedText}>Visible</span>
                  )}
                </td>
                <td>
                  {c.active ? (
                    <span className={styles.mutedText}>Active</span>
                  ) : (
                    <span className={styles.badgeMuted}>Inactive</span>
                  )}
                  {c.pendingEffectiveDate && (
                    <div style={{ marginTop: 4 }}>
                      <span className={styles.badgeMuted} style={{ fontSize: 10 }}>
                        Hours change scheduled: {c.pendingEffectiveDate}
                      </span>
                    </div>
                  )}
                </td>
                <td>
                  <CoachLinkCell coachId={c.id} value={c.meetLink} placeholder="Not set" />
                </td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <button
                      className={styles.linkBtnSmall}
                      onClick={() =>
                        setPanel({
                          kind: "editCoach",
                          coachId: c.id,
                          name: c.name,
                          email: c.email,
                          timezone: c.timezone,
                          hiddenFromStudents: c.hiddenFromStudents,
                          meetLink: c.meetLink,
                          workingHours: c.workingHours,
                          pendingEffectiveDate: c.pendingEffectiveDate,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className={c.active ? styles.dangerLink : styles.linkBtnSmall}
                      onClick={() => handleToggleActive(c.id, !c.active, c.studentCount)}
                    >
                      {c.active ? "Remove" : "Reactivate"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rosterCoaches.length === 0 && (
          <p className={styles.emptyState}>
            {coaches.length === 0 ? "No coaches yet." : "No active coaches — check “Show inactive coaches”."}
          </p>
        )}
      </div>

      {panel?.kind === "addCoach" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <AddCoachPanel onClose={() => setPanel(null)} onAdded={() => { setPanel(null); router.refresh(); }} />
        </ModalOverlay>
      )}

      {panel?.kind === "editCoach" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <EditCoachPanel
            coachId={panel.coachId}
            initialName={panel.name}
            initialEmail={panel.email}
            initialTimezone={panel.timezone}
            initialHiddenFromStudents={panel.hiddenFromStudents}
            initialMeetLink={panel.meetLink}
            initialWorkingHours={panel.workingHours}
            pendingEffectiveDate={panel.pendingEffectiveDate}
            onClose={() => setPanel(null)}
            onSaved={() => { setPanel(null); router.refresh(); }}
          />
        </ModalOverlay>
      )}

      {panel?.kind === "studioHolidays" && (
        <ModalOverlay onClose={() => setPanel(null)}>
          <StudioHolidaysPanel onClose={() => setPanel(null)} onChanged={() => router.refresh()} />
        </ModalOverlay>
      )}
    </div>
  );

  async function handleToggleActive(coachId: string, active: boolean, studentCount: number) {
    if (!active && studentCount > 0) {
      const ok = window.confirm(
        `This coach still has ${studentCount} assigned student${studentCount === 1 ? "" : "s"}. Removing them only stops NEW bookings — reassign those students separately. Continue?`,
      );
      if (!ok) return;
    }
    const res = await fetch("/api/admin/coach-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId, active }),
    });
    if (res.ok) {
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    window.alert(body.error ?? "Could not update that coach.");
  }
}

// ---- Add coach ----
// Kajabi has no concept of a coach — it only ever fires for student
// purchases (see app/api/webhooks/kajabi/route.ts) — so this is a purely
// internal, admin-driven flow, mirroring ProvisionStudentClient's manual
// path rather than anything Kajabi-triggered.
function emptyWorkingHours(): Record<string, [string, string][]> {
  const hours: Record<string, [string, string][]> = {};
  for (const day of DAY_KEYS) hours[day] = [];
  return hours;
}

function AddCoachPanel({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [hourlyRate, setHourlyRate] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [hiddenFromStudents, setHiddenFromStudents] = useState(false);
  const [hours, setHours] = useState<Record<string, [string, string][]>>(emptyWorkingHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim() || !email.trim() || !hourlyRate) {
      setError("Name, email, and hourly rate are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/provision-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        timezone,
        hourlyRate: Number(hourlyRate),
        meetLink: meetLink.trim() || null,
        hiddenFromStudents,
        workingHours: hours,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add that coach.");
      return;
    }
    onAdded();
  }

  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Add coach</h2>
        <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
      </div>
      <p className={styles.mutedText} style={{ marginBottom: 12, fontSize: 12 }}>
        Coaches are internal staff, not Kajabi customers — this creates their login and record directly, with no Kajabi
        side to sync. They'll get a portal login link by email.
      </p>
      <div className={styles.rowForm}>
        <div className={styles.field}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Timezone</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={styles.select}>
            {allTimezones().map((tz) => (
              <option key={tz} value={tz}>{timezoneLabel(tz)}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Hourly rate ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field} style={{ minWidth: 260 }}>
          <label>Meeting link</label>
          <input
            type="url"
            placeholder="https://meet.google.com/…"
            value={meetLink}
            onChange={(e) => setMeetLink(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, margin: "12px 0" }}>
        <input
          type="checkbox"
          checked={hiddenFromStudents}
          onChange={(e) => setHiddenFromStudents(e.target.checked)}
        />
        Hidden from trial picker
      </label>
      <div style={{ marginTop: 4, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Availability
        </h3>
        <p className={styles.mutedText} style={{ marginBottom: 10, fontSize: 12 }}>
          Times are in this coach&apos;s own timezone above. A day with no windows is a day off — can also be set later
          from Availability.
        </p>
        <WorkingHoursGrid hours={hours} setHours={setHours} />
      </div>
      <button onClick={handleAdd} disabled={saving} className={styles.ctaSmall}>
        {saving ? "Adding…" : "Add coach"}
      </button>
      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// ---- Edit coach ----
// Nothing let admin correct a coach's name/email/timezone/visibility
// after AddCoachPanel created the row above — hourly_rate (Finance),
// working_hours (Availability), active (Remove/Reactivate), and
// meet_link (CoachLinkCell) already had their own edit paths, these four
// didn't. Email is the actual login-lookup key
// (lib/auth/resolve-account.ts reads coaches.email directly, not the
// Supabase auth user's email), so fixing a typo'd email here is enough
// on its own to fix that coach's login — no separate auth-side update
// needed.
//
// Also folds in meeting link and availability — per your ask to edit
// "everything in one go" instead of Edit + the roster's meeting-link
// Edit + a separate Availability panel as three actions. Deliberately
// NOT folding in hourly_rate: that's the one field with its own access
// boundary (hasFinanceRole, Finance-tab-only) for a real reason — a
// plain "admin" (not admin_finance) shouldn't see or set pay rate, and
// this modal is isAdminRole (both roles), so adding it here would quietly
// undo that boundary.
function EditCoachPanel({
  coachId,
  initialName,
  initialEmail,
  initialTimezone,
  initialHiddenFromStudents,
  initialMeetLink,
  initialWorkingHours,
  pendingEffectiveDate,
  onClose,
  onSaved,
}: {
  coachId: string;
  initialName: string;
  initialEmail: string;
  initialTimezone: string;
  initialHiddenFromStudents: boolean;
  initialMeetLink: string | null;
  initialWorkingHours: Record<string, [string, string][]>;
  pendingEffectiveDate: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [hiddenFromStudents, setHiddenFromStudents] = useState(initialHiddenFromStudents);
  const [meetLink, setMeetLink] = useState(initialMeetLink ?? "");
  const [hours, setHours] = useState<Record<string, [string, string][]>>(() => {
    const copy: Record<string, [string, string][]> = {};
    for (const day of DAY_KEYS) copy[day] = (initialWorkingHours[day] ?? []).map((w) => [...w] as [string, string]);
    return copy;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const [infoRes, linksRes, hoursRes] = await Promise.all([
      fetch("/api/admin/coach-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          name: name.trim(),
          email: email.trim(),
          timezone,
          hiddenFromStudents,
        }),
      }),
      fetch("/api/admin/coach-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId, meetLink: meetLink.trim() || null }),
      }),
      fetch("/api/admin/coach-working-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId, workingHours: hours }),
      }),
    ]);
    setSaving(false);
    const failed = [infoRes, linksRes, hoursRes].find((r) => !r.ok);
    if (failed) {
      const body = await failed.json().catch(() => ({}));
      setError(body.error ?? "Could not save that coach.");
      return;
    }
    onSaved();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Edit coach</h2>
        <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
      </div>
      <div className={styles.rowForm}>
        <div className={styles.field}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Timezone</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={styles.select}>
            {allTimezones().map((tz) => (
              <option key={tz} value={tz}>{timezoneLabel(tz)}</option>
            ))}
          </select>
        </div>
        <div className={styles.field} style={{ minWidth: 260 }}>
          <label>Meeting link</label>
          <input
            type="url"
            placeholder="https://meet.google.com/…"
            value={meetLink}
            onChange={(e) => setMeetLink(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, margin: "12px 0" }}>
        <input
          type="checkbox"
          checked={hiddenFromStudents}
          onChange={(e) => setHiddenFromStudents(e.target.checked)}
        />
        Hidden from trial picker
      </label>
      <div style={{ marginTop: 4, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Availability
        </h3>
        <p className={styles.mutedText} style={{ marginBottom: 10, fontSize: 12 }}>
          Times are in this coach&apos;s own timezone above. Saving here applies immediately — for an effective-dated
          future change instead, use Availability from the day view.
        </p>
        {pendingEffectiveDate && (
          <p className={styles.mutedText} style={{ marginBottom: 10, fontSize: 12 }}>
            A change is already scheduled to take effect {pendingEffectiveDate}. Saving here applies these hours{" "}
            <strong>immediately</strong> instead and cancels that scheduled change.
          </p>
        )}
        <WorkingHoursGrid hours={hours} setHours={setHours} />
      </div>
      <button onClick={handleSave} disabled={saving} className={styles.ctaSmall}>
        {saving ? "Saving…" : "Save"}
      </button>
      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// ---- Studio holidays ----
// Studio-wide closure dates (studio_holidays, migration 0055) — distinct
// from a per-coach "Add time off" block: every coach is closed at once,
// no new bookings anywhere, and an already-scheduled session on one of
// these dates gets auto-forfeited with no makeup credit (the daily
// materialize-recurring cron sweeps for this). A real admin-managed
// list, not a hardcoded date set, since Easter/Thanksgiving shift every
// year.
interface StudioHoliday {
  id: string;
  date: string;
  label: string | null;
}

function StudioHolidaysPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [holidays, setHolidays] = useState<StudioHoliday[] | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/studio-holidays");
    const body = await res.json().catch(() => ({}));
    setHolidays(body.holidays ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    if (!newDate) {
      setError("A date is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/studio-holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDate, label: newLabel.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add that date.");
      return;
    }
    setNewDate("");
    setNewLabel("");
    await load();
    onChanged();
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    await fetch("/api/admin/studio-holidays", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRemovingId(null);
    await load();
    onChanged();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Studio holidays</h2>
        <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
      </div>
      <p className={styles.mutedText} style={{ marginBottom: 14, fontSize: 12 }}>
        No coach can be booked on these dates, and any session already sitting on one is auto-forfeited with no
        makeup credit (the nightly job sweeps for this — it can take up to a day for a just-added date to clear out
        anything already scheduled on it).
      </p>
      <table className={styles.table} style={{ marginBottom: 16 }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Label</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(holidays ?? []).map((h) => (
            <tr key={h.id}>
              <td>{formatPlainDate(h.date)}</td>
              <td className={styles.mutedText}>{h.label ?? "—"}</td>
              <td>
                <button
                  className={styles.dangerLink}
                  onClick={() => handleRemove(h.id)}
                  disabled={removingId === h.id}
                >
                  {removingId === h.id ? "Removing…" : "Remove"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {holidays?.length === 0 && <p className={styles.mutedText}>No holidays on the list yet.</p>}
      <div className={styles.rowForm}>
        <div className={styles.field}>
          <label>Date</label>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field} style={{ minWidth: 200 }}>
          <label>Label (optional)</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Thanksgiving Day"
            className={styles.input}
          />
        </div>
        <button onClick={handleAdd} disabled={saving} className={styles.ctaSmall}>
          {saving ? "Adding…" : "Add holiday"}
        </button>
      </div>
      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// Every click-to-act panel (book, block, availability, time off, add
// coach, cancel) used to render inline at the bottom of the page, below
// the metrics and the full roster table — so clicking "Availability" in
// a column header, or even "+ Add coach" up in the filter row, opened
// something the admin couldn't see without scrolling all the way down.
// This centers it as a real overlay instead, right where attention
// already is.
function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "56px 16px",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: "100%" }}>
        {children}
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// Click-to-edit for coaches.meet_link — same pattern as Finance's
// CoachRateRow. isAdminRole-gated on the API side (not finance-only):
// this is a session-joining link, not money.
function CoachLinkCell({
  coachId,
  value,
  placeholder,
}: {
  coachId: string;
  value: string | null;
  placeholder: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(value);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/admin/coach-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId, meetLink: inputValue.trim() || null }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(inputValue.trim() || null);
      setEditing(false);
      // Without this, the parent's server-fetched `coaches` prop stays
      // stale until a full reload — the Edit-coach modal (opened from
      // this same row) reads its initial meetLink from that same prop,
      // so it would silently show the pre-edit value if this quick
      // inline edit didn't force a refetch.
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? "Could not save that link.");
    }
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {saved ? (
          <a href={saved} target="_blank" rel="noopener noreferrer" className={styles.linkBtnSmall}>
            Open
          </a>
        ) : (
          <span className={styles.mutedText}>{placeholder}</span>
        )}
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input
        type="url"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        disabled={saving}
        placeholder="https://…"
        className={styles.inputSmall}
        style={{ width: 220 }}
      />
      <button onClick={handleSave} disabled={saving} className={styles.linkBtnSmall}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setInputValue(saved ?? "");
          setEditing(false);
        }}
        disabled={saving}
        className={styles.linkBtnSmall}
      >
        Cancel
      </button>
    </span>
  );
}

function legendDotStyle(color: string, bordered = false): React.CSSProperties {
  return {
    display: "inline-block",
    width: 11,
    height: 11,
    marginRight: 5,
    verticalAlign: "middle",
    borderRadius: 2,
    background: color,
    border: bordered ? "1px solid var(--border)" : undefined,
  };
}

// ---- Book with makeup credit ----
// ---- Cancel / staff-cancel a session, clicked straight from the grid ----
function CancelSessionPanel({
  sessionId,
  studentId,
  studentName,
  scheduledAt,
  isMakeup,
  onClose,
  onDone,
}: {
  sessionId: string;
  studentId: string;
  studentName: string;
  scheduledAt: string;
  isMakeup: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [caps, setCaps] = useState<{ monthlyCreditsUsed: number; yearlyCreditsUsed: number } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/student-cancel-caps?studentId=${studentId}`)
      .then((res) => res.json())
      .then(setCaps);
  }, [studentId]);

  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{studentName}</h2>
        <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
      </div>
      {caps ? (
        <AdminCancelButtons
          sessionId={sessionId}
          scheduledAt={scheduledAt}
          isMakeup={isMakeup}
          monthlyCreditsUsed={caps.monthlyCreditsUsed}
          yearlyCreditsUsed={caps.yearlyCreditsUsed}
          onSuccess={onDone}
        />
      ) : (
        <p className={styles.mutedText}>Loading…</p>
      )}
    </div>
  );
}

// ---- Cancel a group lesson (soft-cancel, see migration 0043) ----
function CancelGroupLessonPanel({
  groupLessonId,
  topic,
  scheduledAt,
  onClose,
  onDone,
}: {
  groupLessonId: string;
  topic: string | null;
  scheduledAt: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/cancel-group-lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupLessonId, reason: reason.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not cancel that group lesson.");
      return;
    }
    onDone();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>
          Cancel {topic || "group lesson"} — <FormattedDateTime value={scheduledAt} />
        </h2>
        <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
      </div>
      <p className={styles.mutedText} style={{ marginBottom: 8, fontSize: 12 }}>
        Cancels for every registered student. Payment for this lesson is handled manually — refund it with the student
        directly if it's owed, this doesn't do that automatically.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why is this lesson being cancelled?"
        className={styles.input}
        style={{ display: "block", width: "100%", marginBottom: 8 }}
      />
      <button onClick={handleCancel} disabled={saving} className={styles.dangerBtn}>
        {saving ? "Cancelling…" : "Confirm cancel"}
      </button>
      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function BookWithCreditPanel({
  coachId,
  coachName,
  slotStart,
  onSwitchToBlock,
  onClose,
  onDone,
}: {
  coachId: string;
  coachName: string;
  slotStart: Date;
  onSwitchToBlock: () => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const { timeZone: displayTimeZone } = useTimeZone();
  const [students, setStudents] = useState<StudentWithCredits[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentWithCredits | null>(null);
  const [selectedCreditId, setSelectedCreditId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/students-with-credits")
      .then((res) => res.json())
      .then((body) => setStudents(body.students ?? []));
  }, []);

  const matches = (students ?? []).filter((s) => s.studentName.toLowerCase().includes(query.trim().toLowerCase()));

  async function handleBook() {
    if (!selectedStudent || !selectedCreditId) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: selectedStudent.studentId,
        slotStart: slotStart.toISOString(),
        makeupCreditId: selectedCreditId,
        coachId,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not book that slot.");
      return;
    }
    onDone();
  }

  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>
          Book with {coachName} — <FormattedDateTime value={slotStart.toISOString()} />
        </h2>
        <div style={{ display: "flex", gap: 12 }}>
          <button className={styles.linkBtnSmall} onClick={onSwitchToBlock}>Block this time instead</button>
          <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
        </div>
      </div>

      {students === null && <p className={styles.mutedText}>Loading students…</p>}

      {students !== null && !selectedStudent && (
        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students with an available makeup credit…"
            className={styles.searchInput}
            style={{ marginBottom: 8 }}
          />
          <ul className={styles.list}>
            {matches.map((s) => (
              <li key={s.studentId} className={styles.listItem}>
                <button className={styles.linkBtnSmall} onClick={() => setSelectedStudent(s)}>
                  {s.studentName} — {s.credits.length} credit{s.credits.length === 1 ? "" : "s"} available
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className={styles.mutedText}>No students with an available makeup credit match that search.</li>}
          </ul>
        </div>
      )}

      {selectedStudent && (
        <div>
          <p style={{ marginBottom: 8 }}>
            <strong>{selectedStudent.studentName}</strong>{" "}
            <button className={styles.linkBtnSmall} onClick={() => { setSelectedStudent(null); setSelectedCreditId(""); }}>
              Change student
            </button>
          </p>
          <div className={styles.field} style={{ marginBottom: 10 }}>
            <label>Which credit</label>
            <select value={selectedCreditId} onChange={(e) => setSelectedCreditId(e.target.value)} className={styles.select}>
              <option value="">Select a credit</option>
              {selectedStudent.credits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.durationMinutes ?? 30}-minute — {c.type}
                  {c.expiresAt ? ` — expires ${formatDateInZone(c.expiresAt, displayTimeZone)}` : " — no expiration"}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleBook} disabled={saving || !selectedCreditId} className={styles.ctaSmall}>
            {saving ? "Booking…" : "Book this slot"}
          </button>
        </div>
      )}

      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// ---- Quick single-slot block ----
function QuickBlockPanel({
  coachId,
  coachName,
  slotStart,
  onClose,
  onDone,
}: {
  coachId: string;
  coachName: string;
  slotStart: Date;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBlock() {
    setSaving(true);
    setError(null);
    const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60 * 1000);
    const res = await fetch("/api/admin/coach-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coachId,
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        reason: reason.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add that block.");
      return;
    }
    onDone();
  }

  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>
          Block {coachName} — <FormattedDateTime value={slotStart.toISOString()} />
        </h2>
        <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
      </div>
      <p className={styles.mutedText} style={{ marginBottom: 8, fontSize: 12 }}>
        Blocks just this 30-minute slot. For a longer stretch — vacation, a half day — use Time off on that coach's column instead.
      </p>
      <div className={styles.rowForm}>
        <div className={styles.field} style={{ flex: 1, minWidth: 160 }}>
          <label>Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Break, Meeting"
            className={styles.input}
            style={{ width: "100%" }}
          />
        </div>
        <button onClick={handleBlock} disabled={saving} className={styles.ctaSmall}>
          {saving ? "Blocking…" : "Block this slot"}
        </button>
      </div>
      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// ---- Weekly availability editor ----
function todayKey(): string {
  return toDateKey(new Date());
}

function AvailabilityPanel({
  coachId,
  coachName,
  initialWorkingHours,
  pendingWorkingHours,
  pendingEffectiveDate,
  onClose,
  onSaved,
}: {
  coachId: string;
  coachName: string;
  initialWorkingHours: Record<string, [string, string][]>;
  pendingWorkingHours: Record<string, [string, string][]> | null;
  pendingEffectiveDate: string | null;
  onClose: () => void;
  onSaved: (savedHours: Record<string, [string, string][]>, isImmediate: boolean) => void;
}) {
  // If a change is already queued, edit *that* by default — starting
  // from the live hours instead would make it easy to accidentally save
  // over a future change nobody meant to touch yet.
  const startingHours = pendingWorkingHours ?? initialWorkingHours;
  const [hours, setHours] = useState<Record<string, [string, string][]>>(() => {
    const copy: Record<string, [string, string][]> = {};
    for (const day of DAY_KEYS) copy[day] = (startingHours[day] ?? []).map((w) => [...w] as [string, string]);
    return copy;
  });
  const [effectiveDate, setEffectiveDate] = useState(pendingEffectiveDate ?? todayKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function discardPending() {
    const copy: Record<string, [string, string][]> = {};
    for (const day of DAY_KEYS) copy[day] = (initialWorkingHours[day] ?? []).map((w) => [...w] as [string, string]);
    setHours(copy);
    setEffectiveDate(todayKey());
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/coach-working-hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId, workingHours: hours, effectiveDate }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save availability.");
      return;
    }
    onSaved(hours, effectiveDate <= todayKey());
  }

  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{coachName}&apos;s availability</h2>
        <button className={styles.linkBtnSmall} onClick={onClose}>Close</button>
      </div>
      <p className={styles.mutedText} style={{ marginBottom: 12, fontSize: 12 }}>
        Times are in {coachName}&apos;s own timezone. A day with no windows is a day off.
      </p>
      {pendingEffectiveDate && (
        <p className={styles.mutedText} style={{ marginBottom: 12, fontSize: 12 }}>
          A change is already scheduled to take effect {pendingEffectiveDate}. You're editing that queued change —{" "}
          <button className={styles.linkBtnSmall} onClick={discardPending}>discard it and edit today's live hours instead</button>.
        </p>
      )}
      <div className={styles.field} style={{ marginBottom: 14, maxWidth: 220 }}>
        <label>Effective date</label>
        <input
          type="date"
          value={effectiveDate}
          min={todayKey()}
          onChange={(e) => setEffectiveDate(e.target.value)}
          className={styles.input}
        />
        <span className={styles.mutedText} style={{ fontSize: 11 }}>
          {effectiveDate <= todayKey()
            ? "Applies immediately on save."
            : `Current hours stay live until ${effectiveDate} — nothing changes before then.`}
        </span>
      </div>
      <WorkingHoursGrid hours={hours} setHours={setHours} />
      <div style={{ marginTop: 14 }}>
        <button onClick={handleSave} disabled={saving} className={styles.ctaSmall}>
          {saving ? "Saving…" : "Save availability"}
        </button>
      </div>
      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// Shared by AvailabilityPanel (editing an existing coach's hours) and
// AddCoachPanel (setting initial hours at creation) — same day-by-window
// picker either way, just a different setHours state behind it.
function WorkingHoursGrid({
  hours,
  setHours,
}: {
  hours: Record<string, [string, string][]>;
  setHours: React.Dispatch<React.SetStateAction<Record<string, [string, string][]>>>;
}) {
  function addWindow(day: string) {
    setHours((prev) => ({ ...prev, [day]: [...(prev[day] ?? []), ["09:00", "17:00"]] }));
  }
  function removeWindow(day: string, idx: number) {
    setHours((prev) => ({ ...prev, [day]: prev[day].filter((_, i) => i !== idx) }));
  }
  function updateWindow(day: string, idx: number, which: 0 | 1, value: string) {
    setHours((prev) => ({
      ...prev,
      [day]: prev[day].map((w, i) => (i === idx ? ((which === 0 ? [value, w[1]] : [w[0], value]) as [string, string]) : w)),
    }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {DAY_KEYS.map((day) => (
        <div key={day} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 90, paddingTop: 6, fontSize: 13 }}>{DAY_LABELS[day]}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            {(hours[day] ?? []).map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="time" value={w[0]} onChange={(e) => updateWindow(day, i, 0, e.target.value)} className={styles.inputSmall} />
                <span className={styles.mutedText}>to</span>
                <input type="time" value={w[1]} onChange={(e) => updateWindow(day, i, 1, e.target.value)} className={styles.inputSmall} />
                <button className={styles.dangerLink} onClick={() => removeWindow(day, i)}>Remove</button>
              </div>
            ))}
            <button className={styles.linkBtnSmall} onClick={() => addWindow(day)}>
              + Add window
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
