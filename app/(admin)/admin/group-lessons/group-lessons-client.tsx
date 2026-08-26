"use client";

import { useEffect, useState } from "react";
import styles from "../../admin.module.css";

interface Coach {
  id: string;
  name: string;
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
  coachId: string;
  coachName: string;
  attendees: Attendee[];
}

export default function GroupLessonsClient({ coaches, students }: { coaches: Coach[]; students: Student[] }) {
  const [lessons, setLessons] = useState<GroupLesson[]>([]);
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/group-lessons")
      .then((res) => res.json())
      .then((data) => setLessons(data.groupLessons ?? []));
  }

  useEffect(load, []);

  async function handleCreate() {
    if (!coachId || !scheduledAt) {
      setError("Coach and date/time are required.");
      return;
    }
    setCreating(true);
    setError(null);

    const res = await fetch("/api/admin/group-lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coachId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: duration,
        topic: topic.trim() || null,
      }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create the group lesson.");
      return;
    }

    setScheduledAt("");
    setTopic("");
    load();
  }

  return (
    <div>
      <div className={styles.panel} style={{ maxWidth: 480 }}>
        <h2>New group lesson</h2>
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
          <button onClick={handleCreate} disabled={creating} className={styles.cta} style={{ alignSelf: "flex-start" }}>
            {creating ? "Creating…" : "Create group lesson"}
          </button>
        </div>
      </div>

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
      {error && <p className={styles.errorText} style={{ marginTop: 4 }}>{error}</p>}
    </div>
  );
}
