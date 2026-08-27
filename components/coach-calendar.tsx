"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  zonedTimeToUtc,
  zonedHourMinute,
  zonedDayKey,
  zonedYearMonthDay,
  formatDateInZone,
  formatDateTimeInZone,
  timezoneAbbreviation,
} from "@/lib/timezone";
import { resolveWorkingHoursForDate } from "@/lib/scheduling/working-hours";
import { useTimeZone } from "./timezone-context";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SLOT_MINUTES = 30;

const STATUS_LABEL: Record<string, string> = {
  attended: "✓",
  "no-show": "✗",
  "late-forfeit": "L",
};

const ATTENDANCE_OPTIONS: { value: string; label: string }[] = [
  { value: "attended", label: "Attended" },
  { value: "no-show", label: "No-show" },
  { value: "late-forfeit", label: "Late-forfeit" },
];

export interface Session {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  isTrial: boolean;
  isMakeup: boolean;
  studentId: string;
  studentName: string;
}

interface GroupLessonAttendee {
  registrationId: string;
  studentId: string;
  studentName: string;
  status: "registered" | "attended" | "no-show";
}

export interface GroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  attendees: GroupLessonAttendee[];
}

interface Block {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
}

interface HeldSlot {
  scheduledAt: string;
  durationMinutes: number;
  studentName: string;
}

interface ScheduleData {
  coach: {
    id: string;
    name: string;
    workingHours: Record<string, [string, string][]>;
    pendingWorkingHours: Record<string, [string, string][]> | null;
    pendingEffectiveDate: string | null;
    timezone: string;
  };
  blocks: Block[];
  sessions: Session[];
  groupLessons: GroupLesson[];
  heldSlots: HeldSlot[];
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

function firstOfMonthKey(key: string): string {
  const d = parseDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

function daysInMonth(key: string): number {
  const d = parseDateKey(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function addMonthsToKey(key: string, delta: number): string {
  const d = parseDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

// Full weeks (Sun-Sat) covering the month `monthStartKey` falls in,
// including the leading/trailing days from adjacent months needed to
// fill out complete rows — the usual month-calendar layout.
function monthGridWeeks(monthStartKey: string): string[][] {
  const gridStart = startOfWeekKey(monthStartKey);
  const monthEndKey = addDaysToKey(monthStartKey, daysInMonth(monthStartKey) - 1);
  const gridEnd = addDaysToKey(startOfWeekKey(monthEndKey), 6);

  const weeks: string[][] = [];
  let cursor = gridStart;
  while (true) {
    const week = Array.from({ length: 7 }, (_, i) => addDaysToKey(cursor, i));
    weeks.push(week);
    cursor = addDaysToKey(cursor, 7);
    if (new Date(cursor) > new Date(gridEnd)) break;
  }
  return weeks;
}

// Nothing anywhere on the grid previously said what day/week/month was
// actually being viewed (just the coach's name + timezone) — real gap,
// not just a month-view thing, caught by testing all three toggles.
function formatRangeLabel(view: "day" | "week" | "month", rangeStartKey: string, numDays: number): string {
  const start = parseDateKey(rangeStartKey);
  if (view === "month") {
    return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (view === "day") {
    return start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  const end = parseDateKey(addDaysToKey(rangeStartKey, numDays - 1));
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = sameMonth
    ? `${end.getDate()}, ${end.getFullYear()}`
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

function formatTimeLabel(minutesFromMidnight: number) {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

// Shared by the coach's own dashboard and the admin all-coaches view.
// `scheduleEndpoint` is the base URL (start/end get appended). The grid
// always displays in the viewer's chosen timezone (useTimeZone(),
// defaulting to the coach's own zone on their own dashboard, or Eastern
// on admin's cross-coach view — see the layouts) and that zone is always
// changeable via the header selector — the coach's actual working-hours
// windows still get checked against *their own* zone regardless of what
// the grid is displayed in.
//
// `canMarkAttendance` enables click-to-mark on past sessions (the
// coach's own dashboard only — admin browses, doesn't mark attendance
// for someone else's session, per section 8).
export default function CoachCalendar({
  scheduleEndpoint,
  canMarkAttendance = false,
  studentLinkBase,
  onRangeChange,
  refreshSignal,
  onAvailableSlotClick,
  onSessionCancelClick,
  onGroupLessonCancelClick,
}: {
  scheduleEndpoint: string;
  canMarkAttendance?: boolean;
  // When set (admin's Coach Schedules page only — a coach can't reach
  // /admin/students), the student's name in each session block links to
  // their admin dashboard view, e.g. "/admin/students".
  studentLinkBase?: string;
  // Reports the currently-visible date range whenever the day/week
  // toggle or navigation changes it — lets a parent page (My Schedule)
  // show an attendance/payroll summary for "whatever the calendar view
  // is above" without duplicating the view/anchor state.
  onRangeChange?: (start: Date, end: Date) => void;
  // Bump this (any changing value) to force a refetch from outside —
  // e.g. My Schedule's "add time off" form, after a block is created.
  refreshSignal?: number;
  // All three optional and additive — omitting them (the coach's own
  // dashboard does) leaves the grid exactly as it was, read-only aside
  // from canMarkAttendance's past-session marking. Passing them (the
  // Coaches page's Week mode does) makes an open slot bookable and a
  // future session/group lesson clickable to cancel, the same actions
  // its own Day grid already has — booking/cancelling was previously
  // only possible from that separate grid, not from Week/Month.
  onAvailableSlotClick?: (slotStart: Date) => void;
  onSessionCancelClick?: (session: Session) => void;
  onGroupLessonCancelClick?: (groupLesson: GroupLesson) => void;
}) {
  const { timeZone: displayTimeZone } = useTimeZone();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [anchorKey, setAnchorKey] = useState(() => toDateKey(new Date()));
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedGroupLesson, setSelectedGroupLesson] = useState<GroupLesson | null>(null);
  const [marking, setMarking] = useState(false);

  // Month view fetches the whole calendar month in one go (same
  // start/end-driven API every other view already uses — no backend
  // change needed) but renders a traditional week-rows day grid instead
  // of the time-slot grid, which doesn't scale to 28-31 columns. Payroll
  // summary above (My Schedule) reads whatever range is reported via
  // onRangeChange, so switching to Month automatically shows the full
  // month's totals there too.
  const rangeStartKey =
    view === "week" ? startOfWeekKey(anchorKey) : view === "month" ? firstOfMonthKey(anchorKey) : anchorKey;
  const numDays = view === "week" ? 7 : view === "month" ? daysInMonth(firstOfMonthKey(anchorKey)) : 1;
  const dayKeys = Array.from({ length: numDays }, (_, i) => addDaysToKey(rangeStartKey, i));

  useEffect(() => {
    setLoading(true);
    const startDate = parseDateKey(rangeStartKey);
    const endDate = parseDateKey(addDaysToKey(rangeStartKey, numDays));
    const sep = scheduleEndpoint.includes("?") ? "&" : "?";
    fetch(`${scheduleEndpoint}${sep}start=${startDate.toISOString()}&end=${endDate.toISOString()}`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleEndpoint, rangeStartKey, numDays, refreshTick, refreshSignal]);

  useEffect(() => {
    const startDate = parseDateKey(rangeStartKey);
    const endDate = parseDateKey(addDaysToKey(rangeStartKey, numDays));
    onRangeChange?.(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStartKey, numDays]);

  const coachTimeZone = data?.coach.timezone ?? "America/New_York";
  const gridTimeZone = displayTimeZone ?? coachTimeZone;
  const hoursSource = {
    workingHours: data?.coach.workingHours ?? {},
    pendingWorkingHours: data?.coach.pendingWorkingHours ?? null,
    pendingEffectiveDate: data?.coach.pendingEffectiveDate ?? null,
  };

  // Working-hours windows are wall-clock in the COACH's zone, but the row
  // axis itself is labeled (and must be bounded) in gridTimeZone — when
  // an admin views a coach in a different zone, a window's minute range
  // shifts, and using the coach's raw numbers as the row bounds would
  // silently clip off real available/booked time that falls outside
  // those now-mislabeled rows (caught live: a coach's 9am-5pm ET clipped
  // to only "9:00 AM"-"2:00 PM" once viewed in Pacific, hiding the
  // earlier 6-9am PT portion entirely). Convert each window's start/end
  // to a real instant on a representative date for that weekday (this
  // week, for DST correctness), then read its gridTimeZone minutes.
  //
  // Resolved per actual calendar date (not a flat day-of-week map) so a
  // week straddling a pending effective-date change (migration 0044)
  // still shows the right hours on each side of it, rather than one
  // version bleeding across the whole week.
  const weekStartKey = startOfWeekKey(anchorKey);
  const { rowStartMinutes, rowEndMinutes } = useMemo(() => {
    // Same padded-to-actual-hours range for every view (Day, Week, and
    // the "All coaches" grid on the Coaches page all use this identical
    // approach) — a full-24-hour Week grid was tried and felt worse:
    // mostly empty, and inconsistent with how Day already behaved.
    let min = 9 * 60;
    let max = 17 * 60;
    let found = false;
    for (let dow = 0; dow < 7; dow++) {
      const dateKey = addDaysToKey(weekStartKey, dow);
      const windowsForDay = resolveWorkingHoursForDate(hoursSource, dateKey);
      const windows = windowsForDay[DAY_KEYS[dow]] ?? [];
      if (windows.length === 0) continue;
      const refDate = parseDateKey(dateKey);
      const year = refDate.getFullYear();
      const month = refDate.getMonth() + 1;
      const day = refDate.getDate();

      for (const [start, end] of windows) {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const startInstant = zonedTimeToUtc(year, month, day, sh, sm, coachTimeZone);
        const endInstant = zonedTimeToUtc(year, month, day, eh, em, coachTimeZone);
        const [gsh, gsm] = zonedHourMinute(startInstant, gridTimeZone);
        const [geh, gem] = zonedHourMinute(endInstant, gridTimeZone);
        const gStart = gsh * 60 + gsm;
        // An end exactly on midnight in the grid zone (e.g. a window
        // that runs into the next calendar day once shifted) reads as
        // 0 — treat it as end-of-day rather than collapsing the range.
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

    // A group lesson (e.g. a bootcamp) is deliberately not restricted to
    // the coach's configured working hours the way a 1:1 recurring slot
    // is (slotFitsWorkingHours) — it can legitimately run at a time no
    // individual session ever would. The row range above only accounts
    // for working-hours windows, so a lesson outside them had nowhere to
    // render and was silently invisible on this grid even though the
    // data was there. Expand the range to cover every real group lesson
    // too, same conversion approach as the working-hours windows above.
    for (const lesson of data?.groupLessons ?? []) {
      const startInstant = new Date(lesson.scheduledAt);
      const endInstant = new Date(startInstant.getTime() + lesson.durationMinutes * 60_000);
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

    return { rowStartMinutes: min, rowEndMinutes: max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, coachTimeZone, gridTimeZone, weekStartKey]);

  const rows: number[] = [];
  for (let m = rowStartMinutes; m < rowEndMinutes; m += SLOT_MINUTES) rows.push(m);

  function cellState(dayKey: string, minutesFromMidnight: number) {
    const d = parseDateKey(dayKey);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = Math.floor(minutesFromMidnight / 60);
    const minute = minutesFromMidnight % 60;

    // This cell's instant, as displayed (gridTimeZone) — may differ from
    // the coach's own zone when an admin is viewing.
    const slotStart = zonedTimeToUtc(year, month, day, hour, minute, gridTimeZone);
    const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60 * 1000);

    // Whether this counts as "working hours" is always checked against
    // the coach's OWN zone, converting the displayed instant back —
    // including which side of a pending effective-date change (migration
    // 0044) this specific date falls on.
    const coachDow = zonedDayKey(slotStart, coachTimeZone);
    const [coachHour, coachMinute] = zonedHourMinute(slotStart, coachTimeZone);
    const coachMinutes = coachHour * 60 + coachMinute;
    const [cy, cm, cd] = zonedYearMonthDay(slotStart, coachTimeZone);
    const coachDateKey = `${cy}-${String(cm).padStart(2, "0")}-${String(cd).padStart(2, "0")}`;
    const windows = resolveWorkingHoursForDate(hoursSource, coachDateKey)[coachDow] ?? [];
    const inWorkingHours = windows.some(([start, end]) => {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      return coachMinutes >= sh * 60 + sm && coachMinutes < eh * 60 + em;
    });

    if (!inWorkingHours) return { type: "blank" as const };

    const groupLesson = (data?.groupLessons ?? []).find((g) => {
      const gStart = new Date(g.scheduledAt);
      const gEnd = new Date(gStart.getTime() + g.durationMinutes * 60 * 1000);
      return slotStart < gEnd && slotEnd > gStart;
    });
    if (groupLesson) {
      const isGroupStart = slotStart.getTime() === new Date(groupLesson.scheduledAt).getTime();
      return { type: "group" as const, groupLesson, isGroupStart };
    }

    const session = (data?.sessions ?? []).find((s) => {
      const sStart = new Date(s.scheduledAt);
      const sEnd = new Date(sStart.getTime() + s.durationMinutes * 60 * 1000);
      return slotStart < sEnd && slotEnd > sStart;
    });
    if (session) {
      const isStart = slotStart.getTime() === new Date(session.scheduledAt).getTime();
      // A no-notice (late) cancellation stays blocked, not reopened —
      // shown the same "held, no booking" grey as a paused student's
      // reserved slot below, not the normal purple "booked" color,
      // since there's no actual lesson happening here anymore. A real
      // session that fell inside a pause window gets the identical
      // treatment (status "paused", migration 0040) — same grey, just a
      // different reason label; the distinct status exists so payroll
      // (PAID_STATUSES) can tell the two apart, not the calendar.
      if (session.status === "cancelled-no-notice" || session.status === "paused") {
        return {
          type: "held" as const,
          reason:
            session.status === "paused"
              ? `Reserved — ${session.studentName} (paused)`
              : `Late cancel — ${session.studentName}`,
          isHeldStart: isStart,
        };
      }
      // Only the row a session actually starts on gets the name label —
      // later rows in the same session's span just stay colored, like a
      // real calendar's single event block rather than a repeated label.
      return { type: "session" as const, session, isSessionStart: isStart };
    }

    const heldSlot = (data?.heldSlots ?? []).find((h) => {
      const hStart = new Date(h.scheduledAt);
      const hEnd = new Date(hStart.getTime() + h.durationMinutes * 60 * 1000);
      return slotStart < hEnd && slotEnd > hStart;
    });
    if (heldSlot) {
      const isHeldStart = slotStart.getTime() === new Date(heldSlot.scheduledAt).getTime();
      return {
        type: "held" as const,
        reason: `Reserved — ${heldSlot.studentName} (paused)`,
        isHeldStart,
      };
    }

    const block = (data?.blocks ?? []).find((b) => {
      const bStart = new Date(b.start_at);
      const bEnd = new Date(b.end_at);
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (block) {
      const isBlockStart = slotStart.getTime() === new Date(block.start_at).getTime();
      return { type: "block" as const, block, isBlockStart };
    }

    return { type: "available" as const, slotStart };
  }

  // Month view is day-granularity, not slot-granularity — a compact
  // summary per calendar date (in gridTimeZone) rather than cellState's
  // exact 30-min-slot lookup, which doesn't apply here.
  function dayEventsSummary(dateKey: string) {
    const d = parseDateKey(dateKey);
    const dayStart = zonedTimeToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), 0, 0, gridTimeZone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const within = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    };

    const sessions = (data?.sessions ?? []).filter(
      (s) => within(s.scheduledAt) && s.status !== "cancelled-no-notice" && s.status !== "paused",
    );
    const heldToday = [
      ...(data?.sessions ?? []).filter(
        (s) => within(s.scheduledAt) && (s.status === "cancelled-no-notice" || s.status === "paused"),
      ),
      ...(data?.heldSlots ?? []).filter((h) => within(h.scheduledAt)),
    ];
    const groups = (data?.groupLessons ?? []).filter((g) => within(g.scheduledAt));
    const blocked = (data?.blocks ?? []).some((b) => within(b.start_at));
    const needsAttendance = sessions.filter(
      (s) => s.status === "scheduled" && new Date(s.scheduledAt).getTime() + s.durationMinutes * 60 * 1000 <= Date.now(),
    ).length;

    return {
      total: sessions.length + groups.length,
      trial: sessions.filter((s) => s.isTrial).length,
      group: groups.length,
      held: heldToday.length,
      blocked,
      needsAttendance,
    };
  }

  async function handleMark(status: string) {
    if (!selectedSession) return;
    setMarking(true);

    const res = await fetch("/api/coach/mark-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selectedSession.id, status }),
    });

    setMarking(false);
    if (res.ok) {
      setSelectedSession(null);
      setRefreshTick((t) => t + 1);
    }
  }

  async function handleMarkGroupAttendee(registrationId: string, status: "attended" | "no-show") {
    setMarking(true);

    const res = await fetch("/api/coach/mark-group-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, status }),
    });

    setMarking(false);
    if (res.ok) {
      // Update in place rather than closing the roster — marking
      // several attendees in a row shouldn't require reopening the
      // panel after each one.
      setSelectedGroupLesson((prev) =>
        prev
          ? {
              ...prev,
              attendees: prev.attendees.map((a) =>
                a.registrationId === registrationId ? { ...a, status } : a,
              ),
            }
          : prev,
      );
      setRefreshTick((t) => t + 1);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {data?.coach.name ?? "Coach"}&apos;s Schedule
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
            ({timezoneAbbreviation(gridTimeZone)})
          </span>
          <span className="ml-3 text-sm font-normal text-[var(--text-muted)]">
            {formatRangeLabel(view, rangeStartKey, numDays)}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("day")}
            className={`rounded px-3 py-1 text-sm ${view === "day" ? "bg-[var(--gold)] text-[var(--gold-text)]" : "border border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            Day
          </button>
          <button
            onClick={() => setView("week")}
            className={`rounded px-3 py-1 text-sm ${view === "week" ? "bg-[var(--gold)] text-[var(--gold-text)]" : "border border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            Week
          </button>
          <button
            onClick={() => setView("month")}
            className={`rounded px-3 py-1 text-sm ${view === "month" ? "bg-[var(--gold)] text-[var(--gold-text)]" : "border border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            Month
          </button>
          <button
            onClick={() =>
              setAnchorKey(
                view === "month"
                  ? addMonthsToKey(anchorKey, -1)
                  : addDaysToKey(anchorKey, view === "week" ? -7 : -1),
              )
            }
            className="rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-muted)]"
          >
            ←
          </button>
          <button
            onClick={() => setAnchorKey(toDateKey(new Date()))}
            className="rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-muted)]"
          >
            Today
          </button>
          <button
            onClick={() =>
              setAnchorKey(
                view === "month"
                  ? addMonthsToKey(anchorKey, 1)
                  : addDaysToKey(anchorKey, view === "week" ? 7 : 1),
              )
            }
            className="rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-muted)]"
          >
            →
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-[var(--slot-open)]" /> Available
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-[var(--gold)]" /> Scheduled
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-[var(--slot-trial)]" /> Trial lesson
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-[var(--slot-group)]" /> Group lesson
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 border border-[var(--border)] bg-[var(--slot-blocked)]" /> Blocked
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-[var(--slot-held)]" /> Held (no booking)
        </span>
        {canMarkAttendance && (
          <span className="text-[var(--text-muted)]">Click a past session to mark attendance</span>
        )}
      </div>

      {loading && <p className="text-[var(--text-muted)]">Loading…</p>}

      {selectedSession && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <span className="font-medium">
            {selectedSession.studentName} —{" "}
            {formatDateTimeInZone(selectedSession.scheduledAt, gridTimeZone)}
            {selectedSession.status !== "scheduled" && (
              <span className="ml-2 text-[var(--text-muted)]">
                (currently: {selectedSession.status})
              </span>
            )}
          </span>
          {ATTENDANCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleMark(opt.value)}
              disabled={marking}
              className="rounded bg-[var(--gold)] px-2 py-1 text-xs text-[var(--gold-text)] disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedSession(null)}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
          >
            Cancel
          </button>
        </div>
      )}

      {selectedGroupLesson && (
        <div className="mb-4 rounded border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {selectedGroupLesson.topic || "Group Lesson"} —{" "}
              {formatDateTimeInZone(selectedGroupLesson.scheduledAt, gridTimeZone)}
            </span>
            <button
              onClick={() => setSelectedGroupLesson(null)}
              className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
            >
              Close
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {selectedGroupLesson.attendees.map((a) => (
              <div key={a.registrationId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[120px]">
                  {a.studentName}
                  {a.status !== "registered" && (
                    <span className="ml-1 text-xs text-[var(--text-muted)]">({a.status})</span>
                  )}
                </span>
                <button
                  onClick={() => handleMarkGroupAttendee(a.registrationId, "attended")}
                  disabled={marking}
                  className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${
                    a.status === "attended"
                      ? "bg-[var(--gold)] text-[var(--gold-text)]"
                      : "border border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  Attended
                </button>
                <button
                  onClick={() => handleMarkGroupAttendee(a.registrationId, "no-show")}
                  disabled={marking}
                  className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${
                    a.status === "no-show"
                      ? "bg-[var(--coral)] text-[var(--coral-text)]"
                      : "border border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  No-show
                </button>
              </div>
            ))}
            {selectedGroupLesson.attendees.length === 0 && (
              <p className="text-[var(--text-muted)]">No students registered yet.</p>
            )}
          </div>
        </div>
      )}

      {!loading && data && view === "month" && (
        <div className="overflow-x-auto">
          <div className="grid text-xs" style={{ gridTemplateColumns: "repeat(7, minmax(90px, 1fr))" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="border-b border-[var(--border)] p-2 text-center font-medium text-[var(--text-muted)]">
                {d}
              </div>
            ))}
            {monthGridWeeks(rangeStartKey).flatMap((week) =>
              week.map((dateKey) => {
                const inMonth = firstOfMonthKey(dateKey) === rangeStartKey;
                const summary = dayEventsSummary(dateKey);
                const dateNum = parseDateKey(dateKey).getDate();
                return (
                  <button
                    key={dateKey}
                    onClick={() => {
                      setAnchorKey(dateKey);
                      setView("day");
                    }}
                    className={`flex min-h-[64px] flex-col items-start gap-1 border-b border-r border-[var(--border)] p-1.5 text-left ${
                      inMonth ? "bg-[var(--surface)]" : "bg-[var(--bg)] opacity-50"
                    } hover:opacity-80`}
                  >
                    <span className="text-[var(--text-muted)]">{dateNum}</span>
                    {summary.total > 0 && (
                      <span className="rounded bg-[var(--gold)] px-1 text-[10px] font-bold text-[var(--gold-text)]">
                        {summary.total} session{summary.total === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="flex flex-wrap gap-0.5">
                      {summary.group > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--slot-group)]" title="Group lesson" />}
                      {summary.held > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--slot-held)]" title="Held" />}
                      {summary.blocked && <span className="h-1.5 w-1.5 rounded-full bg-[var(--slot-blocked)] border border-[var(--border)]" title="Blocked" />}
                    </span>
                    {summary.needsAttendance > 0 && (
                      <span className="rounded bg-[var(--coral)] px-1 text-[10px] font-bold text-[var(--coral-text)]">
                        {summary.needsAttendance} needs mark
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}

      {!loading && data && view !== "month" && (
        <div
          className="overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)]"
          style={{ maxHeight: 560 }}
        >
          <div
            className="grid text-xs"
            style={{ gridTemplateColumns: `80px repeat(${dayKeys.length}, minmax(110px, 1fr))` }}
          >
            <div />
            {dayKeys.map((key) => (
              <div key={key} className="border-b border-[var(--border)] p-2 text-center font-medium">
                {parseDateKey(key).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            ))}

            {rows.map((minutes) => (
              <div key={minutes} className="contents">
                <div className="border-r border-[var(--border)] p-1 text-right text-[var(--text-muted)]">
                  {formatTimeLabel(minutes)}
                </div>
                {dayKeys.map((dayKey) => {
                  const state = cellState(dayKey, minutes);
                  const isTrial = state.type === "session" && state.session.isTrial;
                  const isPast =
                    state.type === "session" &&
                    new Date(state.session.scheduledAt) <= new Date();
                  const isGroupPast =
                    state.type === "group" && new Date(state.groupLesson.scheduledAt) <= new Date();
                  const canMark =
                    canMarkAttendance &&
                    ((state.type === "session" && isPast) || (state.type === "group" && isGroupPast));
                  const canBook = state.type === "available" && !!onAvailableSlotClick;
                  const canCancelSession =
                    state.type === "session" &&
                    !isPast &&
                    state.session.status === "scheduled" &&
                    !!onSessionCancelClick;
                  const canCancelGroup = state.type === "group" && !isGroupPast && !!onGroupLessonCancelClick;
                  const clickable = canMark || canBook || canCancelSession || canCancelGroup;

                  return (
                    <div
                      key={dayKey + minutes}
                      onClick={
                        canMark
                          ? state.type === "session"
                            ? () => setSelectedSession(state.session)
                            : state.type === "group"
                              ? () => setSelectedGroupLesson(state.groupLesson)
                              : undefined
                          : canBook && state.type === "available"
                            ? () => onAvailableSlotClick!(state.slotStart)
                            : canCancelSession && state.type === "session"
                              ? () => onSessionCancelClick!(state.session)
                              : canCancelGroup && state.type === "group"
                                ? () => onGroupLessonCancelClick!(state.groupLesson)
                                : undefined
                      }
                      className={`flex h-6 items-center overflow-hidden border-b border-r border-[var(--border)] px-1 text-[10px] font-bold ${
                        clickable ? "cursor-pointer hover:opacity-80" : ""
                      } ${
                        state.type === "available"
                          ? "bg-[var(--slot-open)] text-[var(--text-muted)]"
                          : state.type === "group"
                            ? "bg-[var(--slot-group)] text-[var(--slot-group-text)]"
                            : state.type === "held"
                              ? "bg-[var(--slot-held)] text-[var(--slot-held-text)]"
                              : state.type === "session"
                                ? isTrial
                                  ? "bg-[var(--slot-trial)] text-[var(--slot-trial-text)]"
                                  : "bg-[var(--gold)] text-[var(--gold-text)]"
                                : state.type === "block"
                                  ? "bg-[var(--slot-blocked)] text-[var(--text-muted)]"
                                  : "bg-[var(--bg)] text-[var(--text-muted)]"
                      }`}
                      title={
                        state.type === "session"
                          ? `${state.session.studentName}${isTrial ? " (trial — pitch Pro upgrade)" : ""} — ${state.session.status}${canCancelSession ? " — click to cancel" : ""}`
                          : state.type === "group"
                            ? `${state.groupLesson.topic || "Group Lesson"} — ${state.groupLesson.attendees.length} student${state.groupLesson.attendees.length === 1 ? "" : "s"}${canCancelGroup ? " — click to cancel" : ""}`
                            : state.type === "held"
                              ? state.reason
                              : state.type === "block"
                                ? (state.block.reason ?? "Blocked")
                                : canBook
                                  ? "Click to book with a makeup credit"
                                  : undefined
                      }
                    >
                      {state.type === "session" && state.isSessionStart && (
                        <span className="flex w-full items-center gap-1 overflow-hidden">
                          <span className="truncate">
                            {studentLinkBase ? (
                              <Link
                                href={`${studentLinkBase}/${state.session.studentId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="underline hover:opacity-80"
                              >
                                {state.session.studentName}
                              </Link>
                            ) : (
                              state.session.studentName
                            )}
                          </span>
                          {STATUS_LABEL[state.session.status] && (
                            <span className="shrink-0">{STATUS_LABEL[state.session.status]}</span>
                          )}
                        </span>
                      )}
                      {state.type === "group" && state.isGroupStart && (
                        <span className="truncate">
                          {state.groupLesson.topic || "Group Lesson"} ({state.groupLesson.attendees.length})
                        </span>
                      )}
                      {state.type === "held" && state.isHeldStart && (
                        <span className="truncate">{state.reason}</span>
                      )}
                      {state.type === "block" && state.isBlockStart && (
                        <span className="truncate">{state.block.reason || "Blocked"}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
