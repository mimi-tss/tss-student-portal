import { formatDateTimeInZone } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// How far ahead to look. Weekly lessons exist a year out, but the
// materializer already skips any week that collides with a group class or
// time off, so real clashes come from one-off bookings/changes — which
// are near-term.
const HORIZON_DAYS = 60;

type Range = { start: Date; end: Date };

function range(startIso: string, minutes: number): Range {
  const start = new Date(startIso);
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

function overlaps(a: Range, b: Range) {
  return a.start < b.end && a.end > b.start;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

interface Clash {
  key: string;
  studentId: string;
  coachId: string;
  at: string;
  summary: string;
}

// Finds every upcoming 1:1 lesson that overlaps something else on the
// calendar and raises a schedule_overlap Needs Review item for each
// (migration 0116, one per clash — resolving it sticks):
//   - another 1:1 with the same coach
//   - that coach's group class
//   - a group class the student is registered in (any coach)
//   - the coach's time off (coach_blocks)
// Booking refuses all of these now (app/api/booking/book); this catches
// what still gets through — admin "Add session", time off added on top
// of existing lessons, older data. Run by /api/cron/schedule-overlaps and
// after admin add-session. Needs the service-role client.
export async function flagScheduleOverlaps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<{ overlapsFound: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  const sessions: {
    id: string;
    student_id: string;
    actual_coach_id: string;
    scheduled_at: string;
    duration_minutes: number;
    students: { name: string } | { name: string }[] | null;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await admin
      .from("sessions")
      .select("id, student_id, actual_coach_id, scheduled_at, duration_minutes, students(name)")
      .eq("status", "scheduled")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizon.toISOString())
      .order("scheduled_at")
      .range(offset, offset + 999);
    sessions.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const [{ data: groupLessons }, { data: blocks }, { data: coaches }] = await Promise.all([
    admin
      .from("group_lessons")
      .select("id, coach_id, scheduled_at, duration_minutes, group_lesson_registrations(student_id, status)")
      .is("cancelled_at", null)
      .gte("scheduled_at", new Date(now.getTime() - 4 * 3_600_000).toISOString())
      .lte("scheduled_at", horizon.toISOString()),
    admin
      .from("coach_blocks")
      .select("id, coach_id, start_at, end_at, reason")
      .gte("end_at", now.toISOString())
      .lte("start_at", horizon.toISOString()),
    admin.from("coaches").select("id, name"),
  ]);

  const coachName = new Map<string, string>((coaches ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const when = (iso: string) => formatDateTimeInZone(iso, DEFAULT_TIMEZONE);
  const studentName = (s: (typeof sessions)[number]) => one(s.students)?.name ?? "A student";

  const clashes: Clash[] = [];

  // 1:1 vs 1:1, same coach. Sorted by start, so only look forward until
  // the next lesson starts after this one ends.
  const byCoach = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = byCoach.get(s.actual_coach_id) ?? [];
    list.push(s);
    byCoach.set(s.actual_coach_id, list);
  }
  for (const [coachId, list] of byCoach) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ra = range(a.scheduled_at, a.duration_minutes);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const rb = range(b.scheduled_at, b.duration_minutes);
        if (rb.start >= ra.end) break;
        clashes.push({
          key: `session:${[a.id, b.id].sort().join("|session:")}`,
          studentId: b.student_id,
          coachId,
          at: b.scheduled_at,
          summary: `${coachName.get(coachId) ?? "Coach"} is double-booked ${when(a.scheduled_at)}: ${studentName(a)} and ${studentName(b)}`,
        });
      }
    }
  }

  for (const s of sessions) {
    const rs = range(s.scheduled_at, s.duration_minutes);
    const coach = coachName.get(s.actual_coach_id) ?? "Coach";

    for (const g of groupLessons ?? []) {
      if (!overlaps(rs, range(g.scheduled_at, g.duration_minutes))) continue;
      const sameCoach = g.coach_id === s.actual_coach_id;
      const registered = (g.group_lesson_registrations ?? []).some(
        (r: { student_id: string; status: string }) => r.student_id === s.student_id && r.status === "registered",
      );
      if (!sameCoach && !registered) continue;
      clashes.push({
        key: `session:${s.id}|group:${g.id}`,
        studentId: s.student_id,
        coachId: s.actual_coach_id,
        at: s.scheduled_at,
        summary: sameCoach
          ? `${studentName(s)}'s lesson ${when(s.scheduled_at)} overlaps ${coach}'s group class`
          : `${studentName(s)}'s lesson ${when(s.scheduled_at)} overlaps a group class they're registered in (${coachName.get(g.coach_id) ?? "another coach"})`,
      });
    }

    for (const b of blocks ?? []) {
      if (b.coach_id !== s.actual_coach_id) continue;
      if (!overlaps(rs, { start: new Date(b.start_at), end: new Date(b.end_at) })) continue;
      clashes.push({
        key: `session:${s.id}|block:${b.id}`,
        studentId: s.student_id,
        coachId: s.actual_coach_id,
        at: s.scheduled_at,
        summary: `${studentName(s)}'s lesson ${when(s.scheduled_at)} falls in ${coach}'s time off${b.reason ? ` (${b.reason})` : ""}`,
      });
    }
  }

  for (const c of clashes) {
    const { error } = await admin.rpc("attention_item_upsert_schedule_overlap", {
      p_dedup_key: c.key,
      p_student_id: c.studentId,
      p_coach_id: c.coachId,
      p_occurrence_at: c.at,
      p_summary: c.summary,
    });
    if (error) console.error("flagScheduleOverlaps upsert failed", c.key, error.message);
  }

  return { overlapsFound: clashes.length };
}
