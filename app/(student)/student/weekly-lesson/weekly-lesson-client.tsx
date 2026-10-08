"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateInZone, formatTimeInZone, timezoneAbbreviation } from "@/lib/timezone";
import { useTimeZone } from "@/components/timezone-context";

interface Coach {
  id: string;
  name: string;
}

interface WeeklyOption {
  dayOfWeek: number;
  startTime: string;
  firstAt: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Weekday of an instant in the viewer's zone — can differ from the
// coach-zone dayOfWeek for late-evening slots across zones.
function weekdayInZone(iso: string, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(new Date(iso));
  return WEEKDAYS.indexOf(name);
}

export default function WeeklyLessonClient({
  coaches,
  lockedCoachId,
  preselectedCoachId,
  durationMinutes,
}: {
  coaches: Coach[];
  lockedCoachId: string | null;
  preselectedCoachId: string | null;
  durationMinutes: number;
}) {
  const { timeZone } = useTimeZone();
  const [coachId, setCoachId] = useState<string | null>(lockedCoachId ?? preselectedCoachId ?? null);
  const [options, setOptions] = useState<WeeklyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<WeeklyOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<{ coachName: string | null; upcoming: string[] } | null>(null);

  // Trial coach (or assigned coach) first, then everyone else.
  const orderedCoaches = useMemo(() => {
    if (!preselectedCoachId) return coaches;
    return [...coaches].sort((a, b) => (a.id === preselectedCoachId ? -1 : b.id === preselectedCoachId ? 1 : 0));
  }, [coaches, preselectedCoachId]);
  const coachName = coaches.find((c) => c.id === coachId)?.name ?? "your coach";

  useEffect(() => {
    if (!coachId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSelected(null);
    fetch(`/api/student/weekly-lesson?coachId=${encodeURIComponent(coachId)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setOptions([]);
          setLoadError(body.error ?? "We couldn't load times right now. Please try again.");
          return;
        }
        setOptions(body.options ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([]);
          setLoadError("We couldn't reach the server. Check your connection and try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, reloadKey]);

  const byWeekday = useMemo(() => {
    const groups = new Map<number, WeeklyOption[]>();
    for (const o of options) {
      const day = weekdayInZone(o.firstAt, timeZone);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(o);
    }
    // Monday-first reads more naturally for a weekly routine.
    return [1, 2, 3, 4, 5, 6, 0]
      .filter((d) => groups.has(d))
      .map((d) => ({
        day: d,
        options: groups.get(d)!.sort((a, b) =>
          formatTimeSortKey(a.firstAt, timeZone).localeCompare(formatTimeSortKey(b.firstAt, timeZone)),
        ),
      }));
  }, [options, timeZone]);

  async function handleConfirm() {
    if (!selected || !coachId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/student/weekly-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId, dayOfWeek: selected.dayOfWeek, startTime: selected.startTime }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(body.error ?? "We couldn't save your weekly lesson. Please try again.");
        if (body.refresh) {
          setSelected(null);
          setReloadKey((k) => k + 1);
        }
        return;
      }
      setDone({ coachName: body.coachName ?? null, upcoming: body.upcoming ?? [] });
    } catch {
      setSaveError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const zoneLabel = timezoneAbbreviation(timeZone);

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 text-[var(--text)]">
        <h1 className="mb-2 text-xl font-semibold">You&apos;re all set!</h1>
        <p className="mb-4 text-[var(--text-muted)]">
          Your weekly lesson with {done.coachName ? `Coach ${done.coachName}` : "your coach"} is booked. We&apos;ve
          emailed you the details.
        </p>
        {done.upcoming.length > 0 && (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <p className="mb-1 font-medium">Your first lessons</p>
            <ul className="space-y-1 text-[var(--text-muted)]">
              {done.upcoming.map((iso) => (
                <li key={iso}>
                  {formatDateInZone(iso, timeZone)} · {formatTimeInZone(iso, timeZone)} {zoneLabel}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Need a different day or time later? Message the studio from your dashboard chat.
        </p>
        <Link
          href="/student/dashboard"
          className="inline-block rounded-lg bg-[var(--gold)] px-4 py-2 font-bold text-[var(--gold-text)]"
        >
          Go to my dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-[var(--text)]">
      <h1 className="mb-1 text-xl font-semibold">Set up your weekly lesson</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        Pick a regular {durationMinutes}-minute time each week. Times are shown in {zoneLabel} — you can change your
        timezone at the top of the page.
      </p>

      {!lockedCoachId && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">1. Choose your coach</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {orderedCoaches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCoachId(c.id)}
                aria-pressed={coachId === c.id}
                className={`w-full rounded-xl border p-3 text-left ${
                  coachId === c.id
                    ? "border-[var(--gold)] bg-[var(--surface-2)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="font-medium">Coach {c.name}</span>
                {c.id === preselectedCoachId && (
                  <span className="ml-2 text-xs text-[var(--text-muted)]">your trial coach</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {coachId && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">
            {lockedCoachId ? "Choose your weekly time" : "2. Choose your weekly time"} with Coach {coachName}
          </h2>

          {loading && <p className="text-sm text-[var(--text-muted)]">Loading times…</p>}

          {loadError && (
            <div className="rounded-xl border border-[var(--coral)]/40 bg-[var(--coral)]/10 p-3 text-sm">
              <p className="mb-2">{loadError}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && byWeekday.length === 0 && (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-muted)]">
              Coach {coachName} has no open weekly times right now.{" "}
              {lockedCoachId
                ? "Please message the studio from your dashboard and we'll find a time with you."
                : "Try another coach, or message the studio from your dashboard."}
            </p>
          )}

          {!loading && !loadError && (
            <div className="space-y-4">
              {byWeekday.map(({ day, options: dayOptions }) => (
                <div key={day}>
                  <p className="mb-1 text-sm font-medium">{WEEKDAYS[day]}s</p>
                  <div className="flex flex-wrap gap-2">
                    {dayOptions.map((o) => {
                      const isSelected = selected?.dayOfWeek === o.dayOfWeek && selected?.startTime === o.startTime;
                      return (
                        <button
                          key={`${o.dayOfWeek}-${o.startTime}`}
                          type="button"
                          onClick={() => {
                            setSelected(o);
                            setSaveError(null);
                          }}
                          aria-pressed={isSelected}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            isSelected
                              ? "border-[var(--gold)] bg-[var(--gold)] font-bold text-[var(--gold-text)]"
                              : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                          }`}
                        >
                          {formatTimeInZone(o.firstAt, timeZone)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {saveError && <p className="mb-4 text-sm text-[var(--coral)]">{saveError}</p>}

      {selected && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="font-medium">
            Every {WEEKDAYS[weekdayInZone(selected.firstAt, timeZone)]} at {formatTimeInZone(selected.firstAt, timeZone)}{" "}
            {zoneLabel} with Coach {coachName}
          </p>
          <p className="mb-3 mt-1 text-sm text-[var(--text-muted)]">
            First lesson: {formatDateInZone(selected.firstAt, timeZone)}. To change this later, you&apos;ll message the
            studio.
          </p>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="w-full rounded-lg bg-[var(--gold)] px-4 py-2 font-bold text-[var(--gold-text)] disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Saving…" : "Confirm my weekly lesson"}
          </button>
        </section>
      )}
    </main>
  );
}

// "HH:MM" in the viewer's zone, for ordering times within a weekday.
function formatTimeSortKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );
}
