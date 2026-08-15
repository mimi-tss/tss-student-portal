"use client";

import { useEffect, useMemo, useState } from "react";
import { zonedTimeToUtc, zonedHourMinute, zonedDayKey } from "@/lib/timezone";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SLOT_MINUTES = 30;

interface Session {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  isTrial: boolean;
  studentName: string;
}

interface Block {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
}

interface ScheduleData {
  coach: {
    id: string;
    name: string;
    workingHours: Record<string, [string, string][]>;
    timezone: string;
  };
  blocks: Block[];
  sessions: Session[];
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

function formatTimeLabel(minutesFromMidnight: number) {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

// Shared by the coach's own dashboard and the admin all-coaches view.
// `scheduleEndpoint` is the base URL (start/end get appended); omit
// `displayTimeZone` to show the calendar in the coach's own zone
// (their own dashboard), or force one (e.g. Eastern) to normalize every
// coach's calendar to the same display zone for admin — the coach's
// actual working-hours windows still get checked against *their own*
// zone regardless of what the grid is displayed in.
export default function CoachCalendar({
  scheduleEndpoint,
  displayTimeZone,
}: {
  scheduleEndpoint: string;
  displayTimeZone?: string;
}) {
  const [view, setView] = useState<"day" | "week">("week");
  const [anchorKey, setAnchorKey] = useState(() => toDateKey(new Date()));
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  const rangeStartKey = view === "week" ? startOfWeekKey(anchorKey) : anchorKey;
  const numDays = view === "week" ? 7 : 1;
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
  }, [scheduleEndpoint, rangeStartKey, numDays]);

  const workingHours = data?.coach.workingHours ?? {};
  const coachTimeZone = data?.coach.timezone ?? "America/New_York";
  const gridTimeZone = displayTimeZone ?? coachTimeZone;

  const { rowStartMinutes, rowEndMinutes } = useMemo(() => {
    let min = 9 * 60;
    let max = 17 * 60;
    let found = false;
    for (const windows of Object.values(workingHours)) {
      for (const [start, end] of windows) {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        if (!found) {
          min = sh * 60 + sm;
          max = eh * 60 + em;
          found = true;
        } else {
          min = Math.min(min, sh * 60 + sm);
          max = Math.max(max, eh * 60 + em);
        }
      }
    }
    return { rowStartMinutes: min, rowEndMinutes: max };
  }, [workingHours]);

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
    // the coach's OWN zone, converting the displayed instant back.
    const coachDow = zonedDayKey(slotStart, coachTimeZone);
    const [coachHour, coachMinute] = zonedHourMinute(slotStart, coachTimeZone);
    const coachMinutes = coachHour * 60 + coachMinute;
    const windows = workingHours[coachDow] ?? [];
    const inWorkingHours = windows.some(([start, end]) => {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      return coachMinutes >= sh * 60 + sm && coachMinutes < eh * 60 + em;
    });

    if (!inWorkingHours) return { type: "blank" as const };

    const session = (data?.sessions ?? []).find((s) => {
      const sStart = new Date(s.scheduledAt);
      const sEnd = new Date(sStart.getTime() + s.durationMinutes * 60 * 1000);
      return slotStart < sEnd && slotEnd > sStart;
    });
    if (session) return { type: "session" as const, session };

    const block = (data?.blocks ?? []).find((b) => {
      const bStart = new Date(b.start_at);
      const bEnd = new Date(b.end_at);
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (block) return { type: "block" as const, block };

    return { type: "available" as const };
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {data?.coach.name ?? "Coach"}&apos;s Schedule
          {displayTimeZone && (
            <span className="ml-2 text-xs font-normal text-gray-500">
              ({displayTimeZone})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("day")}
            className={`rounded px-3 py-1 text-sm ${view === "day" ? "bg-black text-white" : "border"}`}
          >
            Day
          </button>
          <button
            onClick={() => setView("week")}
            className={`rounded px-3 py-1 text-sm ${view === "week" ? "bg-black text-white" : "border"}`}
          >
            Week
          </button>
          <button
            onClick={() => setAnchorKey(addDaysToKey(anchorKey, view === "week" ? -7 : -1))}
            className="rounded border px-3 py-1 text-sm"
          >
            ←
          </button>
          <button
            onClick={() => setAnchorKey(toDateKey(new Date()))}
            className="rounded border px-3 py-1 text-sm"
          >
            Today
          </button>
          <button
            onClick={() => setAnchorKey(addDaysToKey(anchorKey, view === "week" ? 7 : 1))}
            className="rounded border px-3 py-1 text-sm"
          >
            →
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-gray-200" /> Available
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-purple-300" /> Scheduled
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 border-2 border-amber-400 bg-purple-300" /> Trial
          lesson
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 bg-black" /> Blocked
        </span>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && data && (
        <div className="overflow-x-auto">
          <div
            className="grid text-xs"
            style={{ gridTemplateColumns: `80px repeat(${dayKeys.length}, minmax(110px, 1fr))` }}
          >
            <div />
            {dayKeys.map((key) => (
              <div key={key} className="border-b p-2 text-center font-medium">
                {parseDateKey(key).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            ))}

            {rows.map((minutes) => (
              <div key={minutes} className="contents">
                <div className="border-r p-1 text-right text-gray-500">
                  {formatTimeLabel(minutes)}
                </div>
                {dayKeys.map((dayKey) => {
                  const state = cellState(dayKey, minutes);
                  const isTrial = state.type === "session" && state.session.isTrial;
                  return (
                    <div
                      key={dayKey + minutes}
                      className={`h-6 border-b border-r ${
                        state.type === "available"
                          ? "bg-gray-200"
                          : state.type === "session"
                            ? isTrial
                              ? "border-2 border-amber-400 bg-purple-300"
                              : "bg-purple-300"
                            : state.type === "block"
                              ? "bg-black"
                              : "bg-white"
                      }`}
                      title={
                        state.type === "session"
                          ? `${state.session.studentName}${isTrial ? " (trial — pitch Pro upgrade)" : ""}`
                          : state.type === "block"
                            ? (state.block.reason ?? "Blocked")
                            : undefined
                      }
                    />
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
