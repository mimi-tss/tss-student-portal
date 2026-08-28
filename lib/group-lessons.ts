import type { createClient } from "@/lib/supabase/server";
import { occurrencesFor, WEEKS_AHEAD } from "@/lib/scheduling/recurring";
import { getHolidayDateKeys } from "@/lib/scheduling/holidays";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface GroupLessonAttendee {
  registrationId: string;
  studentId: string;
  studentName: string;
  status: "registered" | "attended" | "no-show";
}

export interface CoachGroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  maxStudents: number | null;
  attendees: GroupLessonAttendee[];
}

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// A coach's own group lessons in a date range, with attendee rosters —
// feeds both the calendar grid (green cells) and Today's Schedule.
export async function getCoachGroupLessons(
  supabase: SupabaseClient,
  coachId: string,
  start: string,
  end: string,
): Promise<CoachGroupLesson[]> {
  const { data: lessons } = await supabase
    .from("group_lessons")
    .select(
      "id, topic, scheduled_at, duration_minutes, max_students, group_lesson_registrations(id, student_id, status, students(name))",
    )
    .eq("coach_id", coachId)
    .is("cancelled_at", null)
    .gte("scheduled_at", start)
    .lte("scheduled_at", end)
    .order("scheduled_at");

  return (lessons ?? []).map((l) => ({
    id: l.id,
    topic: l.topic,
    scheduledAt: l.scheduled_at,
    durationMinutes: l.duration_minutes,
    maxStudents: l.max_students,
    attendees: (
      (l.group_lesson_registrations as unknown as {
        id: string;
        student_id: string;
        status: "registered" | "attended" | "no-show";
        students: { name: string } | { name: string }[] | null;
      }[]) ?? []
    ).map((r) => ({
      registrationId: r.id,
      studentId: r.student_id,
      studentName: unwrapJoin(r.students)?.name ?? "Student",
      status: r.status,
    })),
  }));
}

export interface StudentGroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  coachName: string;
}

// Upcoming group lessons a student is registered for — shown on their
// dashboard the same way a trial lesson is (spec: "still be on
// dashboard similar to trial lesson"), even though the billing/
// registration path is entirely separate (Stripe, admin-confirmed).
export async function getStudentUpcomingGroupLessons(
  supabase: SupabaseClient,
  studentId: string,
): Promise<StudentGroupLesson[]> {
  const { data: registrations } = await supabase
    .from("group_lesson_registrations")
    .select("group_lessons(id, topic, scheduled_at, duration_minutes, cancelled_at, coaches(name))")
    .eq("student_id", studentId);

  const now = Date.now();
  return (registrations ?? [])
    .map((r) => {
      const lesson = unwrapJoin(
        r.group_lessons as unknown as
          | {
              id: string;
              topic: string | null;
              scheduled_at: string;
              duration_minutes: number;
              cancelled_at: string | null;
              coaches: { name: string } | { name: string }[] | null;
            }
          | {
              id: string;
              topic: string | null;
              scheduled_at: string;
              duration_minutes: number;
              cancelled_at: string | null;
              coaches: { name: string } | { name: string }[] | null;
            }[]
          | null,
      );
      // A cancelled lesson shouldn't linger as "upcoming" on the
      // student's dashboard — this was previously unfiltered here
      // (unlike getCoachGroupLessons and the admin GET route, which
      // both already excluded cancelled ones).
      if (!lesson || lesson.cancelled_at) return null;
      return {
        id: lesson.id,
        topic: lesson.topic,
        scheduledAt: lesson.scheduled_at,
        durationMinutes: lesson.duration_minutes,
        coachName: unwrapJoin(lesson.coaches)?.name ?? "Coach",
      };
    })
    .filter((l): l is StudentGroupLesson => !!l && new Date(l.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

// Admin-only creation (spec: "can only be added by admin") — enforced by
// RLS ("admins can manage group lessons" is a `for all using(is_admin())`
// policy, migration 0031), not re-checked here; a non-admin's insert
// simply gets rejected by the database, same posture as
// app/api/admin/add-credit/route.ts.
export async function createGroupLesson(
  supabase: SupabaseClient,
  params: {
    coachId: string;
    scheduledAt: string;
    durationMinutes: number;
    topic?: string | null;
    maxStudents?: number | null;
    recurringGroupLessonId?: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("group_lessons")
    .insert({
      coach_id: params.coachId,
      scheduled_at: params.scheduledAt,
      duration_minutes: params.durationMinutes,
      topic: params.topic ?? null,
      max_students: params.maxStudents ?? null,
      recurring_group_lesson_id: params.recurringGroupLessonId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return data.id;
}

// Admin manually confirms the Stripe payment came through, then
// registers the student — identical posture to purchased-addon session
// credits (migration 0014): no live Stripe integration, no webhook.
// Enforces max_students (if set) here rather than relying on the caller
// to check first — registration is the only place a spot is actually
// claimed, so it's the one place a race between two admins registering
// at once would matter.
export async function registerStudentInGroupLesson(
  supabase: SupabaseClient,
  params: { groupLessonId: string; studentId: string; stripeReference?: string | null },
): Promise<void> {
  const { data: lesson, error: lessonError } = await supabase
    .from("group_lessons")
    .select("max_students")
    .eq("id", params.groupLessonId)
    .single();
  if (lessonError) throw new Error(lessonError.message);

  if (lesson.max_students !== null) {
    const { count } = await supabase
      .from("group_lesson_registrations")
      .select("id", { count: "exact", head: true })
      .eq("group_lesson_id", params.groupLessonId);
    if ((count ?? 0) >= lesson.max_students) {
      throw new Error("This group lesson is full.");
    }
  }

  const { error } = await supabase.from("group_lesson_registrations").insert({
    group_lesson_id: params.groupLessonId,
    student_id: params.studentId,
    stripe_reference: params.stripeReference ?? null,
  });
  if (error) throw new Error(error.message);
}

export interface RecurringGroupLesson {
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

// Active recurring group lesson series, admin's management view (mirrors
// the one-off list on the same page).
export async function getActiveRecurringGroupLessons(supabase: SupabaseClient): Promise<RecurringGroupLesson[]> {
  const { data } = await supabase
    .from("recurring_group_lessons")
    .select("id, coach_id, topic, day_of_week, start_time, duration_minutes, max_students, start_date, end_date, coaches(name)")
    .eq("active", true)
    .order("day_of_week")
    .order("start_time");

  return (data ?? []).map((r) => ({
    id: r.id,
    coachId: r.coach_id,
    coachName:
      unwrapJoin(r.coaches as unknown as { name: string } | { name: string }[] | null)?.name ?? "Coach",
    topic: r.topic,
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    durationMinutes: r.duration_minutes,
    maxStudents: r.max_students,
    startDate: r.start_date,
    endDate: r.end_date,
  }));
}

// Creates the series, then materializes its occurrences immediately
// (rather than waiting for the next daily cron pass) — same posture as
// app/api/admin/recurring-schedule/route.ts's POST handler.
export async function createRecurringGroupLessonSeries(
  supabase: SupabaseClient,
  params: {
    coachId: string;
    topic?: string | null;
    dayOfWeek: number;
    startTime: string;
    durationMinutes: number;
    maxStudents?: number | null;
    startDate: string;
    endDate?: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("recurring_group_lessons")
    .insert({
      coach_id: params.coachId,
      topic: params.topic ?? null,
      day_of_week: params.dayOfWeek,
      start_time: params.startTime,
      duration_minutes: params.durationMinutes,
      max_students: params.maxStudents ?? null,
      start_date: params.startDate,
      end_date: params.endDate ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "insert failed");
  await materializeRecurringGroupLessons(supabase, { seriesId: data.id });
  return data.id;
}

// Updates the series definition, then reconciles already-materialized
// future occurrences to match: any occurrence that's still empty (no
// registrations yet) is deleted and regenerated at the new day/time/
// duration/topic/cap, but an occurrence with even one real registered
// student is left completely alone — an admin fixing a typo in the
// topic or the wrong start time right after creating a series
// shouldn't be able to silently blow away a paid registration as a
// side effect. Deliberately not "delete every future occurrence and
// regenerate" the way editing a 1:1 recurring_schedule is
// (app/api/admin/recurring-schedule/route.ts) — that table has no
// registrations to protect.
export async function updateRecurringGroupLessonSeries(
  supabase: SupabaseClient,
  seriesId: string,
  params: {
    coachId: string;
    topic?: string | null;
    dayOfWeek: number;
    startTime: string;
    durationMinutes: number;
    maxStudents?: number | null;
    startDate: string;
    endDate?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("recurring_group_lessons")
    .update({
      coach_id: params.coachId,
      topic: params.topic ?? null,
      day_of_week: params.dayOfWeek,
      start_time: params.startTime,
      duration_minutes: params.durationMinutes,
      max_students: params.maxStudents ?? null,
      start_date: params.startDate,
      end_date: params.endDate ?? null,
    })
    .eq("id", seriesId);
  if (error) throw new Error(error.message);

  const { data: futureLessons } = await supabase
    .from("group_lessons")
    .select("id, group_lesson_registrations(id)")
    .eq("recurring_group_lesson_id", seriesId)
    .gte("scheduled_at", new Date().toISOString())
    .is("cancelled_at", null);

  const emptyLessonIds = (futureLessons ?? [])
    .filter((l) => !(l.group_lesson_registrations as unknown[] | null)?.length)
    .map((l) => l.id);

  if (emptyLessonIds.length > 0) {
    const { error: deleteError } = await supabase.from("group_lessons").delete().in("id", emptyLessonIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  await materializeRecurringGroupLessons(supabase, { seriesId });
}

// Stops future occurrences from being generated. Deliberately leaves
// already-materialized future group_lessons rows alone — an admin who
// wants to cancel specific upcoming occurrences already has the
// per-lesson cancel action (app/api/admin/cancel-group-lesson) for that,
// and silently mass-cancelling a series someone may have already
// registered/paid students into is the wrong default.
export async function deactivateRecurringGroupLessonSeries(
  supabase: SupabaseClient,
  seriesId: string,
): Promise<void> {
  const { error } = await supabase
    .from("recurring_group_lessons")
    .update({ active: false })
    .eq("id", seriesId);
  if (error) throw new Error(error.message);
}

interface MaterializeGroupLessonsResult {
  created: number;
}

// Creates any missing future group_lessons occurrences for active
// recurring series. Simpler than materializeRecurringSessions
// (lib/scheduling/recurring.ts) on purpose: group lessons have no
// per-student billing cycle, pause window, or cancellation-effective-date
// to account for (those are all per-student concepts; a group lesson
// series belongs to a coach, not a student) and no coach-conflict check
// (the existing one-off creation flow doesn't have one either, so this
// doesn't add a stricter bar recurring series alone would need to
// clear). Idempotent the same way: an occurrence already materialized
// for this series at that exact instant is skipped, cancelled or not,
// so admin-cancelling one occurrence doesn't cause it to reappear on the
// next top-up run.
export async function materializeRecurringGroupLessons(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { seriesId?: string } = {},
): Promise<MaterializeGroupLessonsResult> {
  let query = supabase
    .from("recurring_group_lessons")
    .select("id, coach_id, topic, day_of_week, start_time, duration_minutes, max_students, start_date, end_date")
    .eq("active", true);

  if (opts.seriesId) query = query.eq("id", opts.seriesId);

  const { data: series } = await query;
  const now = new Date();
  let created = 0;
  const holidayDates = await getHolidayDateKeys(supabase);

  for (const s of series ?? []) {
    const { data: coach } = await supabase.from("coaches").select("timezone").eq("id", s.coach_id).single();
    const timeZone = coach?.timezone ?? "America/New_York";

    const startDate = s.start_date ? new Date(`${s.start_date}T00:00:00Z`) : null;
    const effectiveFrom = startDate && startDate > now ? startDate : now;

    let instants = occurrencesFor(s.day_of_week, s.start_time, timeZone, effectiveFrom, WEEKS_AHEAD, null, holidayDates);

    if (s.end_date) {
      const cutoff = new Date(`${s.end_date}T23:59:59.999Z`);
      instants = instants.filter((i) => i <= cutoff);
    }

    if (instants.length === 0) continue;

    const horizonEnd = instants[instants.length - 1];
    const { data: existing } = await supabase
      .from("group_lessons")
      .select("scheduled_at")
      .eq("recurring_group_lesson_id", s.id)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizonEnd.toISOString());

    const taken = new Set(
      (existing ?? []).map((g: { scheduled_at: string }) => new Date(g.scheduled_at).getTime()),
    );

    const rows = instants
      .filter((i) => !taken.has(i.getTime()))
      .map((i) => ({
        coach_id: s.coach_id,
        topic: s.topic,
        scheduled_at: i.toISOString(),
        duration_minutes: s.duration_minutes,
        max_students: s.max_students,
        recurring_group_lesson_id: s.id,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("group_lessons").insert(rows);
      if (!error) {
        created += rows.length;
      } else {
        // Previously swallowed entirely (no else branch) — a created
        // series could silently produce zero real occurrences with no
        // trace anywhere. Logged, not thrown: one bad series shouldn't
        // abort materializing every other active one in the same pass.
        console.error(`materializeRecurringGroupLessons: insert failed for series ${s.id}`, error.message);
      }
    }
  }

  return { created };
}
