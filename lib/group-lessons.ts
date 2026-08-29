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
  const { data: lessons, error } = await supabase
    .from("group_lessons")
    .select(
      "id, topic, scheduled_at, duration_minutes, max_students, group_lesson_registrations(id, student_id, status, students(name))",
    )
    .eq("coach_id", coachId)
    .is("cancelled_at", null)
    .gte("scheduled_at", start)
    .lte("scheduled_at", end)
    .order("scheduled_at");

  // Never swallow this again: an RLS policy recursion (42P17, fixed in
  // migration 0056) made this query fail for months while the discarded
  // error left every calendar looking simply empty — indistinguishable
  // from "no group lessons scheduled", which is what made it so hard to
  // find. Logged rather than thrown so one bad query can't take down a
  // whole schedule page that still renders sessions fine.
  if (error) {
    console.error(`getCoachGroupLessons failed for coach ${coachId}`, error.message);
  }

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

export interface RegisterSeriesResult {
  total: number;
  registered: number;
  alreadyRegistered: number;
  full: number;
  failed: number;
}

// Registers a student into every future, non-cancelled occurrence of a
// recurring series in one action — for a drop-in who wants the whole
// bootcamp, not just one class (the per-occurrence Register button on
// GroupLessonCard stays as-is for that case). Same "future, not
// cancelled, matching the series FK" query updateRecurringGroupLessonSeries
// uses to find a series' occurrences, and thrown (not swallowed) on a
// read error for the same reason that function's comment gives — a
// silently-empty result here could look like "nothing to register" when
// it's actually a query failure.
//
// Continues past a single occurrence's registration failure rather than
// aborting the whole series — an occurrence that's already full, or
// where this student is already registered (the DB's unique
// (group_lesson_id, student_id) constraint), shouldn't block registering
// them into the rest, and neither should one occurrence hitting a genuine
// unexpected error (bucketed as `failed` rather than losing every
// already-successful registration by throwing partway through). Reuses
// registerStudentInGroupLesson's own capacity-check-then-insert per
// occurrence rather than duplicating it; its thrown Error only carries a
// message (no error code), so outcomes are bucketed by matching that
// message text rather than a structured code.
export async function registerStudentInRecurringSeries(
  supabase: SupabaseClient,
  params: { seriesId: string; studentId: string; stripeReference?: string | null },
): Promise<RegisterSeriesResult> {
  const { data: occurrences, error } = await supabase
    .from("group_lessons")
    .select("id")
    .eq("recurring_group_lesson_id", params.seriesId)
    .gte("scheduled_at", new Date().toISOString())
    .is("cancelled_at", null);

  if (error) throw new Error(error.message);

  let registered = 0;
  let alreadyRegistered = 0;
  let full = 0;
  let failed = 0;

  for (const occurrence of occurrences ?? []) {
    try {
      await registerStudentInGroupLesson(supabase, {
        groupLessonId: occurrence.id,
        studentId: params.studentId,
        stripeReference: params.stripeReference,
      });
      registered++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("full")) {
        full++;
      } else if (message.toLowerCase().includes("duplicate key")) {
        alreadyRegistered++;
      } else {
        console.error(`registerStudentInRecurringSeries: occurrence ${occurrence.id} failed`, err);
        failed++;
      }
    }
  }

  return { total: occurrences?.length ?? 0, registered, alreadyRegistered, full, failed };
}

// Removes a single occurrence's registration — the per-class counterpart
// to registerStudentInGroupLesson. Deliberately a hard delete of one
// `group_lesson_registrations` row (not a status flip): the row carries
// no other history worth keeping once removed, unlike a session's
// cancelled-status pattern. Only ever called on a `status: "registered"`
// row from the UI side — an admin has no "remove" control on an
// attended/no-show row, so real attendance history is never at risk here.
export async function unregisterStudentFromGroupLesson(
  supabase: SupabaseClient,
  registrationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("group_lesson_registrations")
    .delete()
    .eq("id", registrationId);
  if (error) throw new Error(error.message);
}

export interface SeriesRosterEntry {
  studentId: string;
  studentName: string;
  registeredCount: number;
}

// Everyone currently registered across a series' future, non-cancelled
// occurrences, collapsed to one row per student with how many of those
// occurrences they're in — the roster view for "who's in this bootcamp,"
// not a per-class list (GroupLessonCard already shows that). Same
// occurrence-finding query as registerStudentInRecurringSeries, reused
// rather than reinvented for the same "future, not cancelled, this
// series" definition. Only counts `status: "registered"` rows — a
// student marked attended/no-show on a past-dated occurrence wouldn't
// show up here anyway (excluded by the future-dated filter), but this
// also protects against a same-day occurrence already marked attended.
export async function getRecurringSeriesRoster(
  supabase: SupabaseClient,
  seriesId: string,
): Promise<SeriesRosterEntry[]> {
  const { data: occurrences, error } = await supabase
    .from("group_lessons")
    .select("id")
    .eq("recurring_group_lesson_id", seriesId)
    .gte("scheduled_at", new Date().toISOString())
    .is("cancelled_at", null);
  if (error) throw new Error(error.message);

  const occurrenceIds = (occurrences ?? []).map((o) => o.id);
  if (occurrenceIds.length === 0) return [];

  const { data: registrations, error: regError } = await supabase
    .from("group_lesson_registrations")
    .select("student_id, status, students(name)")
    .in("group_lesson_id", occurrenceIds)
    .eq("status", "registered");
  if (regError) throw new Error(regError.message);

  const byStudent = new Map<string, SeriesRosterEntry>();
  for (const r of (registrations ?? []) as unknown as {
    student_id: string;
    students: { name: string } | { name: string }[] | null;
  }[]) {
    const existing = byStudent.get(r.student_id);
    if (existing) {
      existing.registeredCount++;
    } else {
      byStudent.set(r.student_id, {
        studentId: r.student_id,
        studentName: unwrapJoin(r.students)?.name ?? "Student",
        registeredCount: 1,
      });
    }
  }

  return Array.from(byStudent.values()).sort((a, b) => a.studentName.localeCompare(b.studentName));
}

// Removes a student from every future, non-cancelled occurrence of a
// series in one action — the bulk counterpart to
// unregisterStudentFromGroupLesson, same occurrence-finding query as
// registerStudentInRecurringSeries/getRecurringSeriesRoster. Only
// `status: "registered"` rows are deleted, for the same reason
// getRecurringSeriesRoster only counts them.
export async function unregisterStudentFromRecurringSeries(
  supabase: SupabaseClient,
  params: { seriesId: string; studentId: string },
): Promise<{ removed: number }> {
  const { data: occurrences, error } = await supabase
    .from("group_lessons")
    .select("id")
    .eq("recurring_group_lesson_id", params.seriesId)
    .gte("scheduled_at", new Date().toISOString())
    .is("cancelled_at", null);
  if (error) throw new Error(error.message);

  const occurrenceIds = (occurrences ?? []).map((o) => o.id);
  if (occurrenceIds.length === 0) return { removed: 0 };

  const { data, error: delError } = await supabase
    .from("group_lesson_registrations")
    .delete()
    .in("group_lesson_id", occurrenceIds)
    .eq("student_id", params.studentId)
    .eq("status", "registered")
    .select("id");
  if (delError) throw new Error(delError.message);

  return { removed: (data ?? []).length };
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

  const { data: futureLessons, error: futureError } = await supabase
    .from("group_lessons")
    .select("id, group_lesson_registrations(id)")
    .eq("recurring_group_lesson_id", seriesId)
    .gte("scheduled_at", new Date().toISOString())
    .is("cancelled_at", null);

  // Thrown rather than logged: silently reading zero rows here means the
  // delete below no-ops and materialize then re-inserts the same
  // occurrences, which is exactly how ~13 duplicate rows of one lesson
  // accumulated before migration 0056 fixed the underlying RLS
  // recursion. Failing loudly beats silently duplicating.
  if (futureError) throw new Error(futureError.message);

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
