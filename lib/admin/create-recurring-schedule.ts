import {
  materializeRecurringSessions,
  neighbourWeekdays,
  nextWeeklySlotInstant,
  slotFitsWorkingHours,
  weeklySlotsOverlap,
} from "@/lib/scheduling/recurring";
import { ensureStudentDriveFolder } from "@/lib/google/drive";
import { notifyCoachRecurringScheduleEvent } from "@/lib/notifications/session-events";

export interface CreateRecurringScheduleInput {
  studentId: string;
  // Given: change THAT existing slot (day/time/coach/etc, replacing its
  // own future occurrences). Omitted: ADD a new slot alongside whatever
  // the student already has.
  scheduleId?: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  startDate?: string | null;
  coachId?: string | null;
  cadence?: "weekly" | "biweekly";
  // Slack/in-app ping to the coach that the weekly pattern changed. The
  // admin single-add route and student self-setup send it; CSV bulk
  // import doesn't (a coach doesn't need 40 pings for a migration batch).
  notifyCoach?: boolean;
}

export type CreateRecurringScheduleResult =
  | { success: true; scheduleId: string; created: number; skipped: number; warning: string | null }
  | { success: false; status: number; error: string };

// Same coach-zone weekly clock as weeklySlotsOverlap, for "this new slot
// vs. an existing schedule row".
function overlapsMinutes(
  dayOfWeek: number,
  startTime: string,
  durationMinutes: number,
  other: { day_of_week: number; start_time: string; duration_minutes: number },
) {
  return weeklySlotsOverlap({ day_of_week: dayOfWeek, start_time: startTime, duration_minutes: durationMinutes }, other);
}

// The ONE implementation of "save a student's recurring weekly slot",
// shared by the admin per-student schedule form
// (app/api/admin/recurring-schedule), CSV bulk import
// (app/api/admin/bulk-import-students) and student self-setup
// (app/api/student/weekly-lesson). Those used to be two diverging copies
// — the bulk-import one was missing the student-overlap check and the
// removed-slot reactivation below. Accepts either the RLS-scoped
// session client (admin) or the service-role client (bulk import,
// student self-setup — students can only read recurring_schedules), same
// dual-acceptance as materializeRecurringSessions.
//
// A student can have more than one recurring_schedules row (migration
// 0076 dropped the one-per-student constraint); an exact duplicate
// day/time is caught by the (student_id, day_of_week, start_time) unique
// constraint instead.
export async function createRecurringSchedule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: CreateRecurringScheduleInput,
): Promise<CreateRecurringScheduleResult> {
  const { studentId, scheduleId, dayOfWeek, startTime, durationMinutes, coachId, cadence } = input;

  // Defaults to today when the caller doesn't specify one (e.g. a brand
  // new schedule taking effect right away).
  const effectiveStartDate: string = input.startDate || new Date().toISOString().slice(0, 10);

  const { data: student } = await supabase
    .from("students")
    .select("id, name, assigned_coach_id, billing_anniversary_date")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    return { success: false, status: 404, error: "student not found" };
  }

  // Defaults to the student's overall assigned coach, but can be set
  // independently — e.g. a different coach covers this student's
  // regular weekly slot without changing who they're assigned to
  // overall.
  const effectiveCoachId: string | null = coachId || student.assigned_coach_id;

  if (!effectiveCoachId) {
    return { success: false, status: 400, error: "assign a coach before setting a recurring schedule" };
  }

  const { data: coach } = await supabase
    .from("coaches")
    .select("working_hours, timezone, slack_webhook_url")
    .eq("id", effectiveCoachId)
    .single();

  if (!slotFitsWorkingHours(coach?.working_hours ?? {}, dayOfWeek, startTime, durationMinutes)) {
    return { success: false, status: 409, error: "that time falls outside the coach's working hours" };
  }

  // Catches the common case — a standing Team Huddle or a coach's own
  // recurring lunch break (both just coach_blocks rows once
  // materialized, see lib/coach-blocks.ts) — by checking whether the
  // very NEXT occurrence of this new slot overlaps one. Since both the
  // new schedule and a recurring block repeat the same weekly pattern,
  // a conflict on the next occurrence means every future one conflicts
  // too. One-time blocks later on are skipped per-week by
  // materializeRecurringSessions instead.
  // "Next" counts from the start date when that's in the future (a slot
  // starting Oct 14 shouldn't be refused over a one-time block on Oct 7).
  // Midday UTC on that date is the same calendar date in every US zone.
  const checkFrom =
    effectiveStartDate > new Date().toISOString().slice(0, 10) ? new Date(`${effectiveStartDate}T12:00:00Z`) : new Date();
  const nextInstant = nextWeeklySlotInstant(dayOfWeek, startTime, coach?.timezone ?? "America/New_York", checkFrom);
  const nextInstantEnd = new Date(nextInstant.getTime() + durationMinutes * 60000);
  const { data: conflictingBlock } = await supabase
    .from("coach_blocks")
    .select("id")
    .eq("coach_id", effectiveCoachId)
    .lt("start_at", nextInstantEnd.toISOString())
    .gt("end_at", nextInstant.toISOString())
    .maybeSingle();

  if (conflictingBlock) {
    return {
      success: false,
      status: 409,
      error: "that time is blocked off on the coach's calendar (e.g. a standing meeting or break)",
    };
  }

  // Same next-occurrence check, against the coach's own group lessons —
  // a coach's standing weekly group class could otherwise silently
  // collide with a brand-new weekly 1:1 slot at the exact same day/time,
  // forever. A group lesson's start isn't grid-aligned like a
  // coach_blocks range, so this is a real overlap check in JS.
  const { data: nearbyGroupLessons } = await supabase
    .from("group_lessons")
    .select("scheduled_at, duration_minutes")
    .eq("coach_id", effectiveCoachId)
    .is("cancelled_at", null)
    .gte("scheduled_at", new Date(nextInstant.getTime() - 4 * 60 * 60 * 1000).toISOString())
    .lte("scheduled_at", nextInstantEnd.toISOString());

  const groupLessonConflict = (nearbyGroupLessons ?? []).some((g: { scheduled_at: string; duration_minutes: number }) => {
    const gStart = new Date(g.scheduled_at);
    const gEnd = new Date(gStart.getTime() + g.duration_minutes * 60 * 1000);
    return nextInstant < gEnd && nextInstantEnd > gStart;
  });

  if (groupLessonConflict) {
    return { success: false, status: 409, error: "the coach already has a group lesson scheduled at an overlapping time" };
  }

  // The (student_id, day_of_week, start_time) unique constraint only
  // catches an exact duplicate, not two slots on the same day whose time
  // ranges overlap (e.g. existing Mon 4:00-4:30, new Mon 4:15-4:45) —
  // the student can't actually be in both at once.
  const { data: otherSchedules } = await supabase
    .from("recurring_schedules")
    .select("id, day_of_week, start_time, duration_minutes")
    .eq("student_id", studentId)
    .in("day_of_week", neighbourWeekdays(dayOfWeek))
    .eq("active", true);

  const overlapsExisting = (otherSchedules ?? []).some(
    (other: { id: string; day_of_week: number; start_time: string; duration_minutes: number }) =>
      !(scheduleId && other.id === scheduleId) && overlapsMinutes(dayOfWeek, startTime, durationMinutes, other),
  );

  if (overlapsExisting) {
    return { success: false, status: 409, error: "this overlaps with another weekly slot this student already has that day" };
  }

  // The coach side of the same problem: a different student could
  // already have a recurring slot with this coach that overlaps the new
  // one. Recurring vs. recurring is a guaranteed-forever conflict
  // (unlike a one-off booked session, below), so this hard-blocks.
  // Stopped schedules (a student who left, an old slot) no longer hold
  // the time.
  const { data: coachSchedules } = await supabase
    .from("recurring_schedules")
    .select("id, day_of_week, start_time, duration_minutes, students(name)")
    .eq("coach_id", effectiveCoachId)
    .in("day_of_week", neighbourWeekdays(dayOfWeek))
    .eq("active", true);

  const coachConflict = (coachSchedules ?? []).find(
    (other: { id: string; day_of_week: number; start_time: string; duration_minutes: number }) =>
      !(scheduleId && other.id === scheduleId) && overlapsMinutes(dayOfWeek, startTime, durationMinutes, other),
  );

  if (coachConflict) {
    const otherStudent = coachConflict.students as unknown as { name: string } | null;
    return {
      success: false,
      status: 409,
      error: otherStudent?.name
        ? `the coach already has ${otherStudent.name} booked at an overlapping time that day`
        : "the coach already has another student booked at an overlapping time that day",
    };
  }

  // One-off bookings (a makeup, a trial, a reassigned session) aren't a
  // recurring pattern, so they can't be checked the same structural way
  // — but the coach could still already have a real session sitting
  // right at this new slot's very next occurrence. This doesn't hard-
  // block (materializeRecurringSessions below skips just that one
  // instant and keeps the rest); the warning lets the caller say so.
  const { data: conflictingSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("actual_coach_id", effectiveCoachId)
    .eq("scheduled_at", nextInstant.toISOString())
    .not("status", "eq", "cancelled-with-notice")
    .maybeSingle();

  // Editing an existing schedule (scheduleId given): drop its own
  // not-yet-happened, untouched occurrences from the new start date
  // onward, so the old pattern doesn't linger alongside the new one.
  // Occurrences BEFORE the new start date belong to the old pattern and
  // are deliberately left in place — that's how "Fridays 3:30pm starting
  // now, Fridays 6pm starting Oct 1" keeps the September Friday-3:30pm
  // sessions intact. Anything already cancelled or attended is real
  // history and stays untouched regardless.
  let existingSchedule: { id: string } | null = null;
  if (scheduleId) {
    const { data } = await supabase
      .from("recurring_schedules")
      .select("id")
      .eq("id", scheduleId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!data) {
      return { success: false, status: 404, error: "schedule not found" };
    }
    existingSchedule = data;

    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("recurring_schedule_id", data.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date(`${effectiveStartDate}T00:00:00Z`).toISOString());

    // RLS blocking a delete doesn't error, it just matches zero rows
    // (migration 0054 fixes the missing policy); this still fails loudly
    // if that regresses.
    if (deleteError) {
      return { success: false, status: 500, error: deleteError.message };
    }
  }

  // Adding a "new" slot at a day/time this student had before and had
  // removed: removing flips `active` to false rather than deleting the
  // row (FK reasons — see the DELETE route), and the unique constraint
  // isn't scoped to active rows, so a plain INSERT would 23505 against
  // that dead row. Caught live: Victoria's Friday 7:30pm slot, removed
  // earlier, refused to come back. Reactivate that row instead.
  let reactivatedDeadRow = false;
  if (!existingSchedule) {
    const { data: deadSchedule } = await supabase
      .from("recurring_schedules")
      .select("id")
      .eq("student_id", studentId)
      .eq("day_of_week", dayOfWeek)
      .eq("start_time", startTime)
      .eq("active", false)
      .maybeSingle();
    if (deadSchedule) {
      existingSchedule = deadSchedule;
      reactivatedDeadRow = true;
    }
  }

  const writtenAt = new Date().toISOString();
  const scheduleRow = {
    student_id: studentId,
    coach_id: effectiveCoachId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    duration_minutes: durationMinutes,
    start_date: effectiveStartDate,
    cadence: cadence === "biweekly" ? "biweekly" : "weekly",
    active: true,
    updated_at: writtenAt,
  };

  const { data: schedule, error } = existingSchedule
    ? await supabase
        .from("recurring_schedules")
        .update(scheduleRow)
        .eq("id", existingSchedule.id)
        .select("id, updated_at")
        .single()
    : await supabase.from("recurring_schedules").insert(scheduleRow).select("id, updated_at").single();

  if (error) {
    // 23505 = unique_violation on recurring_schedules_student_day_time_key
    // (adding, not editing, hits this).
    if (error.code === "23505") {
      return { success: false, status: 409, error: "this student already has a weekly slot at that day/time" };
    }
    // 23P01 = exclusion_violation — the optional coach-overlap guard in
    // migration 0125, the database-level backstop for the race below.
    if (error.code === "23P01") {
      return { success: false, status: 409, error: "someone else just took that time with this coach" };
    }
    return { success: false, status: 500, error: error.message };
  }

  // Race guard: two saves for the same coach at overlapping times (two
  // students self-booking the same slot at the same moment) can both
  // pass the coach-conflict check above before either has written. Re-read
  // now that ours is written; if an overlapping active slot for this coach
  // exists that was written first (ties broken by id), ours loses and is
  // undone before any sessions are generated. Both racers see each other,
  // so exactly one keeps its slot. Only for a brand-new or reactivated
  // row — an admin editing an existing slot has already cleared its old
  // sessions, so undoing that edit isn't a clean rollback.
  if (!existingSchedule || reactivatedDeadRow) {
    const { data: rivals } = await supabase
      .from("recurring_schedules")
      .select("id, day_of_week, start_time, duration_minutes, updated_at")
      .eq("coach_id", effectiveCoachId)
      .in("day_of_week", neighbourWeekdays(dayOfWeek))
      .eq("active", true)
      .neq("id", schedule.id);

    const ours = { id: schedule.id as string, at: new Date(schedule.updated_at ?? writtenAt).getTime() };
    const lost = (rivals ?? []).some(
      (r: { id: string; day_of_week: number; start_time: string; duration_minutes: number; updated_at: string | null }) => {
        if (!overlapsMinutes(dayOfWeek, startTime, durationMinutes, r)) return false;
        const theirs = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        return theirs < ours.at || (theirs === ours.at && r.id < ours.id);
      },
    );

    if (lost) {
      if (reactivatedDeadRow) {
        await supabase.from("recurring_schedules").update({ active: false }).eq("id", schedule.id);
      } else {
        await supabase.from("recurring_schedules").delete().eq("id", schedule.id);
      }
      return { success: false, status: 409, error: "someone else just took that time with this coach" };
    }
  }

  // A student's very first schedule doubles as setting their overall
  // assigned coach — every real Stripe signup arrives with none. Only
  // when currently null: a student who already has one keeps it even if
  // THIS schedule uses a different coach. Done after the slot is safely
  // saved, so a refused save never leaves a coach assigned.
  if (!student.assigned_coach_id) {
    await supabase
      .from("students")
      .update({ assigned_coach_id: effectiveCoachId })
      .eq("id", studentId)
      .is("assigned_coach_id", null);
    // The student's Drive folder is created off their coach, so it can't
    // wait for a manual "Assign coach" click that may never come.
    await ensureStudentDriveFolder(studentId);
  }

  // Backfill for students who predate billing_anniversary_date being set
  // automatically (webhook/provisioning) — without it, the 4-per-cycle
  // cap in materializeRecurringSessions has nothing to anchor to.
  if (!student.billing_anniversary_date) {
    await supabase
      .from("students")
      .update({ billing_anniversary_date: new Date().toISOString().slice(0, 10) })
      .eq("id", student.id)
      .is("billing_anniversary_date", null);
  }

  const result = await materializeRecurringSessions(supabase, { scheduleId: schedule.id });

  if (input.notifyCoach) {
    await notifyCoachRecurringScheduleEvent({
      coachId: effectiveCoachId,
      coachSlackWebhookUrl: coach?.slack_webhook_url ?? null,
      coachTimezone: coach?.timezone ?? "America/New_York",
      studentName: student.name,
      dayOfWeek,
      startTime,
      startDate: effectiveStartDate,
      kind: "recurring_schedule_changed",
      scheduleId: schedule.id,
    });
  }

  // Surface the coach-availability signal rather than hiding it inside a
  // bare success — materializeRecurringSessions silently skips any
  // instant the coach is already busy at, across the full year-ahead
  // horizon, so a schedule can save while generating fewer sessions.
  const warning = conflictingSession
    ? "the coach already has another booking at this slot's very next occurrence — that date (and possibly others) won't have gotten a session"
    : result.skipped > 0
      ? `${result.skipped} occurrence(s) in the next year were skipped because the coach or student already had something else booked then`
      : null;

  return { success: true, scheduleId: schedule.id, created: result.created, skipped: result.skipped, warning };
}
