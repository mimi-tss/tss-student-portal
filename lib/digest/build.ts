import type { SupabaseClient } from "@supabase/supabase-js";
import { firstNameOf, lessonTimeFields } from "@/lib/ghl/fields";
import { cleanGroupTopic } from "@/lib/admin/recording-matching";
import type { DigestLesson, WeeklyDigestInput } from "@/lib/email/templates/weekly-digest";

// Per-student data for the Monday digest — ONE place, used by both the
// cron send (app/api/cron/weekly-digest) and the admin "Preview as"
// (app/api/admin/weekly-email/preview), so a preview is exactly what the
// student will get. Bulk-fetched and grouped in memory (one query per
// table, not per student). Studio boxes/events are added by the caller.

export type StudentDigestData = Omit<WeeklyDigestInput, "features" | "upcoming">;

export interface DigestRecipient {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailOn: boolean;
  data: StudentDigestData;
}

const DAY = 24 * 60 * 60 * 1000;
const HOMEWORK_LOOKBACK_DAYS = 14; // older notes would repeat every Monday
const HOMEWORK_MAX_CHARS = 220;

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function lessonLine(scheduledAt: string, tz: string | null | undefined): string {
  const w = lessonTimeFields(scheduledAt, tz);
  return `${w.lessonDay}, ${w.lessonShortDate} · ${w.lessonTime}`;
}

function trimNote(note: string): string {
  const flat = note.trim();
  if (flat.length <= HOMEWORK_MAX_CHARS) return flat;
  return `${flat.slice(0, HOMEWORK_MAX_CHARS).replace(/\s+\S*$/, "")}…`;
}

export async function buildDigestRecipients(
  admin: SupabaseClient,
  opts: { weekStart: Date; studentIds?: string[] },
): Promise<DigestRecipient[]> {
  const weekStart = opts.weekStart.getTime();
  const weekEndIso = new Date(weekStart + 7 * DAY).toISOString();
  const weekStartIso = new Date(weekStart).toISOString();
  const lastWeekIso = new Date(weekStart - 7 * DAY).toISOString();
  const nowIso = new Date().toISOString();
  const ids = opts.studentIds;
  // Narrow to specific students (preview) — the cast keeps TS from
  // re-deriving PostgREST's deep builder types for every query here.
  type Rows = PromiseLike<{ data: Record<string, unknown>[] | null }>;
  const scope = (q: unknown, col = "student_id"): Rows =>
    (ids ? (q as { in: (c: string, v: string[]) => unknown }).in(col, ids) : q) as Rows;

  const studentsQ = admin
    .from("students")
    .select("id, name, email, phone, notify_digest_email, streak_count, streak_last_active_date")
    .eq("archived", false)
    .neq("tier", "lite");

  const [students, upcoming, groupRegs, attended, recordings, homework, exercises, credits] = await Promise.all([
    scope(studentsQ, "id"),
    scope(
      admin
        .from("sessions")
        .select("student_id, scheduled_at, coaches:actual_coach_id(name, timezone)")
        .eq("status", "scheduled")
        .gte("scheduled_at", weekStartIso)
        .lt("scheduled_at", weekEndIso),
    ),
    scope(
      admin
        .from("group_lesson_registrations")
        .select("student_id, group_lessons(topic, scheduled_at, cancelled_at, coaches(name, timezone))"),
    ),
    scope(
      admin.from("sessions").select("student_id").eq("status", "attended").gte("scheduled_at", lastWeekIso).lt("scheduled_at", weekStartIso),
    ),
    scope(admin.from("meet_recordings").select("matched_student_id").gte("matched_at", lastWeekIso), "matched_student_id"),
    scope(
      admin
        .from("homework_notes")
        .select("student_id, note, created_at, coaches(name)")
        .gte("created_at", new Date(weekStart - HOMEWORK_LOOKBACK_DAYS * DAY).toISOString())
        .order("created_at", { ascending: false }),
    ),
    scope(admin.from("exercise_assignments").select("student_id")),
    scope(
      admin
        .from("makeup_credits")
        .select("student_id, duration_minutes, expires_at")
        .eq("used", false)
        .is("used_session_id", null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
    ),
  ]);

  const lessons = new Map<string, (DigestLesson & { at: string })[]>();
  const addLesson = (sid: string, l: DigestLesson & { at: string }) => lessons.set(sid, [...(lessons.get(sid) ?? []), l]);

  for (const s of (upcoming.data ?? []) as { student_id: string; scheduled_at: string; coaches: One<{ name: string; timezone: string }> }[]) {
    const coach = one(s.coaches);
    addLesson(s.student_id, {
      at: s.scheduled_at,
      when: lessonLine(s.scheduled_at, coach?.timezone),
      label: `Private Coaching Session with Coach ${firstNameOf(coach?.name)}`,
    });
  }
  for (const r of (groupRegs.data ?? []) as {
    student_id: string;
    group_lessons: One<{ topic: string | null; scheduled_at: string; cancelled_at: string | null; coaches: One<{ name: string; timezone: string }> }>;
  }[]) {
    const g = one(r.group_lessons);
    if (!g || g.cancelled_at || g.scheduled_at < weekStartIso || g.scheduled_at >= weekEndIso) continue;
    const coach = one(g.coaches);
    addLesson(r.student_id, {
      at: g.scheduled_at,
      when: lessonLine(g.scheduled_at, coach?.timezone),
      label: `${cleanGroupTopic(g.topic)} with Coach ${firstNameOf(coach?.name)}`,
    });
  }

  const count = (rows: Record<string, unknown>[] | null, col: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r[col] as string, (m.get(r[col] as string) ?? 0) + 1);
    return m;
  };
  const attendedBy = count(attended.data, "student_id");
  const recordingsBy = count(recordings.data, "matched_student_id");
  const exercisesBy = count(exercises.data, "student_id");

  const homeworkBy = new Map<string, { note: string; coachLabel: string }>();
  for (const h of (homework.data ?? []) as { student_id: string; note: string; coaches: One<{ name: string }> }[]) {
    if (homeworkBy.has(h.student_id) || !h.note?.trim()) continue; // newest first
    homeworkBy.set(h.student_id, { note: trimNote(h.note), coachLabel: `Coach ${firstNameOf(one(h.coaches)?.name)}` });
  }

  const creditsBy = new Map<string, { durationMinutes: number; expiresAt: string | null }[]>();
  for (const c of (credits.data ?? []) as { student_id: string; duration_minutes: number | null; expires_at: string | null }[]) {
    creditsBy.set(c.student_id, [...(creditsBy.get(c.student_id) ?? []), { durationMinutes: c.duration_minutes ?? 30, expiresAt: c.expires_at }]);
  }

  return ((students.data ?? []) as {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    notify_digest_email: boolean;
    streak_count: number | null;
    streak_last_active_date: string | null;
  }[]).map((s) => {
    // A streak only counts if it's real (2+ days) and still alive
    // (opened the app within the last 2 days) — otherwise the "start a
    // streak" nudge shows instead of a stale "1 day".
    const alive = !!s.streak_last_active_date && Date.now() - new Date(s.streak_last_active_date).getTime() <= 2 * DAY;
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      emailOn: s.notify_digest_email,
      data: {
        firstName: firstNameOf(s.name),
        streakDays: alive && (s.streak_count ?? 0) >= 2 ? s.streak_count : null,
        thisWeek: (lessons.get(s.id) ?? []).sort((a, b) => a.at.localeCompare(b.at)).map(({ when, label }) => ({ when, label })),
        attendedLastWeek: attendedBy.get(s.id) ?? 0,
        newRecordingsLastWeek: recordingsBy.get(s.id) ?? 0,
        homework: homeworkBy.get(s.id) ?? null,
        exercisesAssigned: exercisesBy.get(s.id) ?? 0,
        credits: creditsBy.get(s.id) ?? [],
      },
    };
  });
}
