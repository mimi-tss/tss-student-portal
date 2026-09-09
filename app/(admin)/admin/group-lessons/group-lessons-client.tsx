"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DAY_NAMES, nextWeeklySlotInstant } from "@/lib/scheduling/recurring";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { formatTimeInZone } from "@/lib/timezone";
import { useTimeZone } from "@/components/timezone-context";
import { FormattedDateTime } from "@/components/formatted-time";
import styles from "../../admin.module.css";

interface Coach {
  id: string;
  name: string;
  timezone: string | null;
}
interface Student {
  id: string;
  name: string;
}
interface Attendee {
  registrationId: string;
  studentId: string;
  studentName: string;
  status: string;
}
interface GroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  maxStudents: number | null;
  coachId: string;
  coachName: string;
  attendees: Attendee[];
}
interface PastGroupLesson extends GroupLesson {
  cancelledAt: string | null;
  cancelReason: string | null;
}
interface RecurringSeries {
  id: string;
  coachId: string;
  coachName: string;
  topic: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  maxStudents: number | null;
  startDate: string;
  endDate: string | null;
}

// "Today" as a plain YYYY-MM-DD in a given zone — matters right at a
// day boundary, where UTC "today" can already be tomorrow. Same helper
// as recurring-schedule-client.tsx (not shared — trivial enough that
// duplicating beats a shared one-liner import).
function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export default function GroupLessonsClient({ coaches, students }: { coaches: Coach[]; students: Student[] }) {
  const { timeZone: displayTimeZone } = useTimeZone();
  const [lessons, setLessons] = useState<GroupLesson[]>([]);
  const [series, setSeries] = useState<RecurringSeries[]>([]);
  const [mode, setMode] = useState<"one-time" | "recurring">("one-time");
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("16:00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [duration, setDuration] = useState(60);
  const [maxStudents, setMaxStudents] = useState("");
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);

  const selectedCoachZone = coaches.find((c) => c.id === coachId)?.timezone ?? DEFAULT_TIMEZONE;

  useEffect(() => {
    setStartDate((d) => d || todayInZone(selectedCoachZone));
  }, [selectedCoachZone]);

  function load() {
    fetch("/api/admin/group-lessons")
      .then((res) => res.json())
      .then((data) => setLessons(data.groupLessons ?? []));
    fetch("/api/admin/group-lessons/recurring")
      .then((res) => res.json())
      .then((data) => setSeries(data.series ?? []));
  }

  useEffect(load, []);

  async function handleCreate() {
    if (!coachId) {
      setError("Coach is required.");
      return;
    }
    if (mode === "one-time" && !scheduledAt) {
      setError("Date and time are required.");
      return;
    }
    if (mode === "recurring" && (!startTime || !startDate)) {
      setError("Start time and start date are required.");
      return;
    }

    setCreating(true);
    setError(null);

    const recurringBody = {
      coachId,
      dayOfWeek,
      startTime,
      startDate,
      endDate: endDate || null,
      durationMinutes: duration,
      topic: topic.trim() || null,
      maxStudents: maxStudents ? Number(maxStudents) : null,
    };

    const res = editingSeriesId
      ? await fetch("/api/admin/group-lessons/recurring", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingSeriesId, ...recurringBody }),
        })
      : await fetch(mode === "one-time" ? "/api/admin/group-lessons" : "/api/admin/group-lessons/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "one-time"
              ? {
                  coachId,
                  scheduledAt: new Date(scheduledAt).toISOString(),
                  durationMinutes: duration,
                  topic: topic.trim() || null,
                  maxStudents: maxStudents ? Number(maxStudents) : null,
                }
              : recurringBody,
          ),
        });
    setCreating(false);
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? "Couldn't save the group lesson.");
      return;
    }

    resetForm();
    load();
  }

  function resetForm() {
    setEditingSeriesId(null);
    setMode("one-time");
    setScheduledAt("");
    setDayOfWeek(1);
    setStartTime("16:00");
    setEndDate("");
    setDuration(60);
    setTopic("");
    setMaxStudents("");
    setError(null);
  }

  function handleEditSeries(s: RecurringSeries) {
    setEditingSeriesId(s.id);
    setMode("recurring");
    setCoachId(s.coachId);
    setTopic(s.topic ?? "");
    setDayOfWeek(s.dayOfWeek);
    setStartTime(s.startTime);
    setDuration(s.durationMinutes);
    setMaxStudents(s.maxStudents ? String(s.maxStudents) : "");
    setStartDate(s.startDate);
    setEndDate(s.endDate ?? "");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleStopSeries(id: string) {
    await fetch(`/api/admin/group-lessons/recurring?id=${id}`, { method: "DELETE" });
    if (editingSeriesId === id) resetForm();
    load();
  }

  return (
    <div>
      <div className={styles.panel} style={{ maxWidth: 480 }}>
        <h2>{editingSeriesId ? "Edit recurring series" : "New group lesson"}</h2>
        {!editingSeriesId && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setMode("one-time")}
              className={mode === "one-time" ? styles.ctaSmall : styles.linkBtnSmall}
            >
              One-time
            </button>
            <button
              type="button"
              onClick={() => setMode("recurring")}
              className={mode === "recurring" ? styles.ctaSmall : styles.linkBtnSmall}
            >
              Recurring
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={styles.field}>
            <label htmlFor="gl-coach">Coach</label>
            <select
              id="gl-coach"
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
          </div>

          {mode === "one-time" ? (
            <div className={styles.field}>
              <label htmlFor="gl-scheduled-at">Date &amp; time</label>
              <input
                id="gl-scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={styles.input}
              />
            </div>
          ) : (
            <>
              <div className={styles.field}>
                <label htmlFor="gl-day">Day of week</label>
                <select
                  id="gl-day"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className={styles.select}
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="gl-start-time">Start time ({selectedCoachZone})</label>
                <input
                  id="gl-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="gl-start-date">Start date</label>
                <input
                  id="gl-start-date"
                  type="date"
                  value={startDate}
                  // No min while editing an existing series — its
                  // start_date is very likely already in the past by
                  // the time an admin comes back to edit it, and the
                  // input must still show/accept that saved value.
                  min={editingSeriesId ? undefined : todayInZone(selectedCoachZone)}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="gl-end-date">End date (optional)</label>
                <input
                  id="gl-end-date"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={styles.input}
                />
              </div>
            </>
          )}

          <div className={styles.field}>
            <label htmlFor="gl-duration">Duration (minutes)</label>
            <input
              id="gl-duration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="gl-max-students">Max students (optional)</label>
            <input
              id="gl-max-students"
              type="number"
              min={1}
              value={maxStudents}
              onChange={(e) => setMaxStudents(e.target.value)}
              placeholder="No limit"
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="gl-topic">Topic (optional)</label>
            <input
              id="gl-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Belting workshop"
              className={styles.input}
            />
          </div>
          {error && <p className={styles.errorText}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreate} disabled={creating} className={styles.cta}>
              {creating
                ? "Saving…"
                : editingSeriesId
                  ? "Save changes"
                  : mode === "one-time"
                    ? "Create group lesson"
                    : "Create recurring series"}
            </button>
            {editingSeriesId && (
              <button type="button" onClick={resetForm} className={styles.linkBtnSmall}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {series.length > 0 && (
        <>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Recurring series
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {series.map((s) => {
              // startTime is wall-clock in the COACH's own zone — resolve
              // to a real instant off that, then reformat (weekday
              // included, since crossing into the viewer's zone can shift
              // it) in whatever zone the viewer has selected. Same
              // approach as recurring-schedule-client.tsx.
              const coachTimeZone = coaches.find((c) => c.id === s.coachId)?.timezone ?? DEFAULT_TIMEZONE;
              const instant = nextWeeklySlotInstant(s.dayOfWeek, s.startTime, coachTimeZone);
              const weekday = new Intl.DateTimeFormat("en-US", {
                timeZone: displayTimeZone,
                weekday: "long",
              }).format(instant);
              return (
              <div
                key={s.id}
                className={styles.panel}
                style={{
                  marginBottom: 0,
                  outline: editingSeriesId === s.id ? "2px solid var(--gold)" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <p className={styles.rowName}>{s.topic || "Group Lesson"}</p>
                    <p className={styles.mutedText}>
                      Every {weekday} at {formatTimeInZone(instant, displayTimeZone)} · {s.durationMinutes} min · Coach{" "}
                      {s.coachName}
                      {s.maxStudents ? ` · cap ${s.maxStudents}` : ""}
                      {" · "}
                      {s.startDate}
                      {s.endDate ? ` → ${s.endDate}` : " (ongoing)"}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleEditSeries(s)} className={styles.linkBtnSmall}>
                      Edit
                    </button>
                    <button onClick={() => handleStopSeries(s.id)} className={styles.linkBtnSmall}>
                      Stop
                    </button>
                  </div>
                </div>
                <SeriesRegisterControl seriesId={s.id} students={students} onRegistered={load} />
              </div>
              );
            })}
          </div>
        </>
      )}

      <h2
        style={{
          margin: "0 0 12px",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Upcoming group lessons
      </h2>
      {lessons.length === 0 && <p className={styles.emptyState}>None scheduled.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        {lessons.map((lesson) => (
          <GroupLessonCard key={lesson.id} lesson={lesson} students={students} onRegistered={load} />
        ))}
      </div>

      <GroupLessonHistory />
    </div>
  );
}

// Collapsed by default (same "Show all sessions this billing cycle"
// pattern used on the student page) — cancelled lessons at any date, plus
// past ones that ran, neither of which the main GET (upcoming-only,
// not-cancelled) ever returns. No register/cancel actions here — this is
// a look-back, not a management view.
function GroupLessonHistory() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lessons, setLessons] = useState<PastGroupLesson[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());

    fetch(`/api/admin/group-lessons/history?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setLessons(data.groupLessons ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={styles.linkBtn}>
        Show previous group lessons
      </button>
    );
  }

  return (
    <div>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Previous group lessons</h2>
        <button onClick={() => setOpen(false)} className={styles.linkBtnSmall}>
          Hide
        </button>
      </div>
      <div className={styles.rowForm} style={{ marginBottom: 12 }}>
        <div className={styles.field}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={styles.input} />
        </div>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className={styles.linkBtnSmall}
          >
            Clear dates
          </button>
        )}
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      {loading && <p className={styles.mutedText}>Loading…</p>}
      {!loading && lessons.length === 0 && <p className={styles.emptyState}>Nothing found for these filters.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {lessons.map((lesson) => (
          <div key={lesson.id} className={styles.panel} style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <p className={styles.rowName}>{lesson.topic || "Group Lesson"}</p>
                <p className={styles.mutedText}>
                  <FormattedDateTime value={lesson.scheduledAt} /> · {lesson.durationMinutes} min · Coach{" "}
                  {lesson.coachName} · {lesson.attendees.length}
                  {lesson.maxStudents ? `/${lesson.maxStudents}` : ""} registered
                </p>
              </div>
              {!lesson.cancelledAt && (
                <CancelGroupLessonButton
                  groupLessonId={lesson.id}
                  hasTopic={!!lesson.topic?.trim()}
                  registeredCount={lesson.attendees.length}
                  onCancelled={load}
                />
              )}
            </div>
            {lesson.cancelledAt ? (
              <p className={styles.errorText} style={{ marginTop: 4 }}>
                Cancelled <FormattedDateTime value={lesson.cancelledAt} />
                {lesson.cancelReason ? ` — ${lesson.cancelReason}` : ""}
              </p>
            ) : (
              <p className={styles.mutedText} style={{ marginTop: 4 }}>Held as scheduled.</p>
            )}
            {lesson.attendees.length > 0 && (
              <ul className={styles.list} style={{ marginTop: 8 }}>
                {lesson.attendees.map((a) => (
                  <li key={a.registrationId} className={styles.listItem}>
                    <Link href={`/admin/students/${a.studentId}`} className={styles.rowName}>
                      {a.studentName}
                    </Link>{" "}
                    <span className={styles.mutedText}>({a.status})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SeriesRosterEntry {
  studentId: string;
  studentName: string;
  registeredCount: number;
}

// Shows who's registered across a series' future occurrences (collapsed
// to one row per student, with a Remove that unregisters them from every
// occurrence at once) and, below that, the same "register for the whole
// series" action as before — for a drop-in who wants the whole bootcamp,
// not one class at a time via GroupLessonCard's per-occurrence Register.
function SeriesRegisterControl({
  seriesId,
  students,
  onRegistered,
}: {
  seriesId: string;
  students: Student[];
  onRegistered: () => void;
}) {
  const [roster, setRoster] = useState<SeriesRosterEntry[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [stripeReference, setStripeReference] = useState("");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  function loadRoster() {
    fetch(`/api/admin/group-lessons/roster?seriesId=${seriesId}`)
      .then((res) => res.json())
      .then((data) => setRoster(data.roster ?? []));
  }

  useEffect(loadRoster, [seriesId]);

  async function handleRemove(targetStudentId: string) {
    setRemovingId(targetStudentId);
    setRosterError(null);

    const res = await fetch("/api/admin/group-lessons/register-series", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, studentId: targetStudentId }),
    });
    setRemovingId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRosterError(body.error ?? "Couldn't remove that student.");
      return;
    }

    loadRoster();
    onRegistered();
  }

  async function handleRegister() {
    if (!studentId) return;
    setRegistering(true);
    setError(null);
    setSummary(null);

    const res = await fetch("/api/admin/group-lessons/register-series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, studentId, stripeReference: stripeReference.trim() || null }),
    });
    const body = await res.json().catch(() => ({}));
    setRegistering(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't register that student.");
      return;
    }

    const parts = [`registered for ${body.registered} of ${body.total} upcoming classes`];
    if (body.alreadyRegistered) parts.push(`${body.alreadyRegistered} already registered`);
    if (body.full) parts.push(`${body.full} full`);
    if (body.failed) parts.push(`${body.failed} failed`);
    setSummary(parts.join(", "));
    setStripeReference("");
    loadRoster();
    onRegistered();
  }

  return (
    <div style={{ marginTop: 8 }}>
      {roster.length > 0 && (
        <ul className={styles.list} style={{ marginBottom: 8 }}>
          {roster.map((r) => (
            <li
              key={r.studentId}
              className={styles.listItem}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
            >
              <span>
                <Link href={`/admin/students/${r.studentId}`} className={styles.rowName}>
                  {r.studentName}
                </Link>{" "}
                <span className={styles.mutedText}>({r.registeredCount} upcoming)</span>
              </span>
              <button
                onClick={() => handleRemove(r.studentId)}
                disabled={removingId === r.studentId}
                className={styles.linkBtnSmall}
              >
                {removingId === r.studentId ? "Removing…" : "Remove from series"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rosterError && <p className={styles.errorText} style={{ margin: "0 0 8px" }}>{rosterError}</p>}

      {!open ? (
        <button onClick={() => setOpen(true)} className={styles.linkBtnSmall}>
          Register for whole series…
        </button>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={styles.selectSmall}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={stripeReference}
            onChange={(e) => setStripeReference(e.target.value)}
            placeholder="Stripe payment reference (optional)"
            className={styles.inputSmall}
          />
          <button onClick={handleRegister} disabled={registering} className={styles.ctaSmall}>
            {registering ? "Registering…" : "Register for series"}
          </button>
          <button onClick={() => setOpen(false)} className={styles.linkBtnSmall}>
            Close
          </button>
          {summary && <p className={styles.successText} style={{ width: "100%", margin: 0 }}>{summary}</p>}
          {error && <p className={styles.errorText} style={{ width: "100%", margin: 0 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

function GroupLessonCard({
  lesson,
  students,
  onRegistered,
}: {
  lesson: GroupLesson;
  students: Student[];
  onRegistered: () => void;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [stripeReference, setStripeReference] = useState("");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFull = lesson.maxStudents !== null && lesson.attendees.length >= lesson.maxStudents;

  async function handleRegister() {
    if (!studentId) return;
    setRegistering(true);
    setError(null);

    const res = await fetch("/api/admin/group-lessons/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupLessonId: lesson.id, studentId, stripeReference: stripeReference.trim() || null }),
    });
    setRegistering(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't register that student.");
      return;
    }

    setStripeReference("");
    onRegistered();
  }

  return (
    <div className={styles.panel} style={{ marginBottom: 0 }}>
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <p className={styles.rowName}>{lesson.topic || "Group Lesson"}</p>
          <p className={styles.mutedText}>
            <FormattedDateTime value={lesson.scheduledAt} /> · {lesson.durationMinutes} min · Coach {lesson.coachName}
            {" · "}
            {lesson.attendees.length}
            {lesson.maxStudents ? `/${lesson.maxStudents}` : ""} registered
          </p>
        </div>
        <CancelGroupLessonButton
          groupLessonId={lesson.id}
          hasTopic={!!lesson.topic?.trim()}
          registeredCount={lesson.attendees.length}
          onCancelled={onRegistered}
        />
      </div>

      {lesson.attendees.length > 0 && (
        <ul className={styles.list} style={{ marginBottom: 12 }}>
          {lesson.attendees.map((a) => (
            <li
              key={a.registrationId}
              className={styles.listItem}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
            >
              <Link href={`/admin/students/${a.studentId}`} className={styles.rowName}>
                {a.studentName}
              </Link>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={styles.mutedText}>{a.status}</span>
                {a.status === "registered" && (
                  <RemoveAttendeeControl
                    registrationId={a.registrationId}
                    hasTopic={!!lesson.topic?.trim()}
                    onRemoved={onRegistered}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {isFull ? (
        <p className={styles.mutedText}>This lesson is full.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={styles.selectSmall}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={stripeReference}
            onChange={(e) => setStripeReference(e.target.value)}
            placeholder="Stripe payment reference (optional)"
            className={styles.inputSmall}
          />
          <button
            onClick={handleRegister}
            disabled={registering}
            className={styles.ctaSmall}
          >
            {registering ? "Registering…" : "Register"}
          </button>
        </div>
      )}
      {error && <p className={styles.errorText} style={{ marginTop: 4 }}>{error}</p>}
    </div>
  );
}

// Removing one student from one occurrence — the same "does the studio
// owe a makeup" judgment call as CancelGroupLessonButton, just scoped to
// one attendee instead of the whole roster (e.g. a student was
// bulk-registered into a series too far ahead by mistake and admin is
// pulling them back out of the far-future ones, not because the lesson
// itself is being cancelled).
function RemoveAttendeeControl({
  registrationId,
  hasTopic,
  onRemoved,
}: {
  registrationId: string;
  hasTopic: boolean;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [issueCredit, setIssueCredit] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setRemoving(true);
    setError(null);

    const res = await fetch("/api/admin/group-lessons/register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, issueCredit }),
    });
    setRemoving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't remove that registration.");
      return;
    }

    onRemoved();
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className={styles.linkBtnSmall}>
        Remove
      </button>
    );
  }

  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={issueCredit}
          disabled={!hasTopic}
          onChange={(e) => setIssueCredit(e.target.checked)}
        />
        Issue a makeup credit
        {!hasTopic && " (needs a topic first)"}
      </label>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={handleRemove} disabled={removing} className={styles.dangerLink}>
          {removing ? "Removing…" : "Confirm remove"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setIssueCredit(false);
            setError(null);
          }}
          disabled={removing}
          className={styles.linkBtnSmall}
        >
          Never mind
        </button>
      </span>
      {error && <span className={styles.errorText}>{error}</span>}
    </span>
  );
}

// Shared between the "Upcoming" cards and the past/cancelled history
// below — a mistaken lesson (a duplicate bootcamp created twice, a wrong
// coach) is just as often caught after it's already happened as before,
// and cancel-group-lesson itself has no restriction on scheduled_at, only
// on not already being cancelled.
function CancelGroupLessonButton({
  groupLessonId,
  hasTopic,
  registeredCount,
  onCancelled,
}: {
  groupLessonId: string;
  hasTopic: boolean;
  registeredCount: number;
  onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Whether the studio owes the roster a makeup is genuinely case-by-case
  // (a duplicate/mistaken lesson with nobody real on it vs. a coach
  // no-show where everyone's owed one) — defaults off so a routine
  // mistake-cleanup doesn't silently hand out credits nobody asked for.
  // registeredCount counts every attendee regardless of status
  // (attended/no-show included, not just literally 'registered') — a
  // lesson cancelled after the fact already has real attendance marks on
  // it, and the credit question here is about the whole roster, not
  // whatever got marked before the cancellation was discovered.
  const [issueCredit, setIssueCredit] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    setCancelError(null);

    const res = await fetch("/api/admin/cancel-group-lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupLessonId, reason: cancelReason.trim(), issueCredit }),
    });
    setCancelling(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setCancelError(body.error ?? "Couldn't cancel that lesson.");
      return;
    }

    onCancelled();
  }

  if (!cancelMode) {
    return (
      <button onClick={() => setCancelMode(true)} className={styles.dangerLink} style={{ flexShrink: 0 }}>
        Cancel lesson
      </button>
    );
  }

  return (
    <div className={styles.warnPanel} style={{ marginTop: 8, marginBottom: 0 }}>
      <p style={{ marginBottom: 4, fontWeight: 600 }}>Cancel this group lesson — reason required</p>
      <p className={styles.mutedText} style={{ marginBottom: 8 }}>
        Notifies nobody automatically and refunds nothing — handle attendee refunds directly, outside the app, same
        as always for group lessons.
      </p>
      <textarea
        value={cancelReason}
        onChange={(e) => setCancelReason(e.target.value)}
        rows={2}
        placeholder="Why is this lesson being cancelled? (e.g. duplicate entry, wrong coach)"
        className={styles.input}
        style={{ display: "block", width: "100%", marginBottom: 8 }}
      />
      {registeredCount > 0 && (
        <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={issueCredit}
            disabled={!hasTopic}
            onChange={(e) => setIssueCredit(e.target.checked)}
          />
          Issue a makeup credit to all {registeredCount} student{registeredCount === 1 ? "" : "s"} on the roster
          {!hasTopic && " (needs a topic set on this lesson first)"}
        </label>
      )}
      {cancelError && <p className={styles.errorText} style={{ marginBottom: 8 }}>{cancelError}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleCancel} disabled={cancelling || !cancelReason.trim()} className={styles.dangerBtn}>
          {cancelling ? "Cancelling…" : "Confirm cancel"}
        </button>
        <button
          onClick={() => {
            setCancelMode(false);
            setCancelReason("");
            setIssueCredit(false);
            setCancelError(null);
          }}
          disabled={cancelling}
          className={styles.linkBtnSmall}
        >
          Never mind
        </button>
      </div>
    </div>
  );
}
