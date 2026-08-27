"use client";

import { useEffect, useState } from "react";
import { DAY_NAMES } from "@/lib/scheduling/recurring";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
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

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
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
            {series.map((s) => (
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
                      Every {DAY_NAMES[s.dayOfWeek]} at {s.startTime} · {s.durationMinutes} min · Coach{" "}
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
              </div>
            ))}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {lessons.map((lesson) => (
          <GroupLessonCard key={lesson.id} lesson={lesson} students={students} onRegistered={load} />
        ))}
      </div>
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
      <div style={{ marginBottom: 8 }}>
        <p className={styles.rowName}>{lesson.topic || "Group Lesson"}</p>
        <p className={styles.mutedText}>
          {new Date(lesson.scheduledAt).toLocaleString()} · {lesson.durationMinutes} min · Coach {lesson.coachName}
          {" · "}
          {lesson.attendees.length}
          {lesson.maxStudents ? `/${lesson.maxStudents}` : ""} registered
        </p>
      </div>

      {lesson.attendees.length > 0 && (
        <ul className={styles.list} style={{ marginBottom: 12 }}>
          {lesson.attendees.map((a) => (
            <li key={a.registrationId} className={styles.listItem} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{a.studentName}</span>
              <span className={styles.mutedText}>{a.status}</span>
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
