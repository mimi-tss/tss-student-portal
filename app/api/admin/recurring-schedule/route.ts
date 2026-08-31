import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  materializeRecurringSessions,
  slotFitsWorkingHours,
  nextWeeklySlotInstant,
} from "@/lib/scheduling/recurring";

// Admin sets a student's recurring weekly lesson slot(s) (spec sections
// 4/5) — the only way a student's regular sessions get scheduled;
// students can't self-book them (see app/api/booking/book/route.ts) or
// change the time themselves, only contact the studio. Creating/updating
// immediately materializes real `sessions` rows via the same logic the
// daily cron top-up uses, so the change shows up on the coach calendar
// right away rather than waiting for tomorrow's run.
//
// A student can have more than one schedule row now (migration 0076 —
// e.g. paying for 2x/week). `scheduleId` distinguishes the two cases: if
// given, this changes THAT existing slot (day/time/coach/etc, replacing
// its own future occurrences); if omitted, this ADDS a new slot
// alongside whatever the student already has, leaving every other
// schedule (and its already-materialized sessions) untouched.
export async function POST(req: NextRequest) {
  const { studentId, scheduleId, dayOfWeek, startTime, durationMinutes, startDate, coachId, cadence } =
    await req.json();

  if (
    !studentId ||
    dayOfWeek === undefined ||
    dayOfWeek === null ||
    !startTime ||
    !durationMinutes
  ) {
    return NextResponse.json(
      { error: "studentId, dayOfWeek, startTime, and durationMinutes required" },
      { status: 400 },
    );
  }

  // Defaults to today when the caller doesn't specify one (e.g. a brand
  // new schedule taking effect right away).
  const effectiveStartDate: string = startDate || new Date().toISOString().slice(0, 10);

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, assigned_coach_id, billing_anniversary_date")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  // Defaults to the student's overall assigned coach, but can be set
  // independently — e.g. a different coach covers this student's
  // regular weekly slot without changing who they're assigned to
  // overall (students/coaches can't make this choice themselves).
  const effectiveCoachId: string | null = coachId || student.assigned_coach_id;

  if (!effectiveCoachId) {
    return NextResponse.json(
      { error: "assign a coach before setting a recurring schedule" },
      { status: 400 },
    );
  }

  // Backfill for students who predate billing_anniversary_date being set
  // automatically (webhook/provisioning) — without it, the 4-per-cycle
  // cap in materializeRecurringSessions has nothing to anchor to and
  // silently doesn't apply. Today is a reasonable stand-in: it's not
  // necessarily their real Kajabi invoice date, but it's the best anchor
  // available and keeps the weekly cadence correctly capped from here on.
  if (!student.billing_anniversary_date) {
    await supabase
      .from("students")
      .update({ billing_anniversary_date: new Date().toISOString().slice(0, 10) })
      .eq("id", student.id)
      .is("billing_anniversary_date", null);
  }

  const { data: coach } = await supabase
    .from("coaches")
    .select("working_hours, timezone")
    .eq("id", effectiveCoachId)
    .single();

  if (
    !slotFitsWorkingHours(coach?.working_hours ?? {}, dayOfWeek, startTime, durationMinutes)
  ) {
    return NextResponse.json(
      { error: "that time falls outside the coach's working hours" },
      { status: 409 },
    );
  }

  // Catches the common case — a standing Team Huddle or a coach's own
  // recurring lunch break (both just coach_blocks rows once
  // materialized, see lib/coach-blocks.ts) — by checking whether the
  // very NEXT occurrence of this new slot overlaps one. Since both the
  // new schedule and a recurring block repeat the same weekly pattern,
  // a conflict on the next occurrence means every future one conflicts
  // too, so one check is enough without walking the full horizon. A
  // one-time vacation block that only happens to land on the very next
  // occurrence would also (correctly) get caught here, and would just
  // as correctly stop conflicting once that block passes — a false
  // negative for weeks 2+ in that narrow case, not a false positive.
  const nextInstant = nextWeeklySlotInstant(dayOfWeek, startTime, coach?.timezone ?? "America/New_York");
  const nextInstantEnd = new Date(nextInstant.getTime() + durationMinutes * 60000);
  const { data: conflictingBlock } = await supabase
    .from("coach_blocks")
    .select("id")
    .eq("coach_id", effectiveCoachId)
    .lt("start_at", nextInstantEnd.toISOString())
    .gt("end_at", nextInstant.toISOString())
    .maybeSingle();

  if (conflictingBlock) {
    return NextResponse.json(
      { error: "that time is blocked off on the coach's calendar (e.g. a standing meeting or break)" },
      { status: 409 },
    );
  }

  // A student can have more than one schedule row now (migration 0076)
  // — the (student_id, day_of_week, start_time) unique constraint only
  // catches an exact duplicate, not two slots on the same day whose
  // time ranges overlap (e.g. existing Mon 4:00-4:30, new Mon 4:15-4:45)
  // — the student can't actually be in both at once, so check for that
  // here rather than letting it silently double-book them.
  const { data: otherSchedules } = await supabase
    .from("recurring_schedules")
    .select("id, start_time, duration_minutes")
    .eq("student_id", studentId)
    .eq("day_of_week", dayOfWeek);

  const [newHH, newMM] = startTime.split(":").map(Number);
  const newStartMin = newHH * 60 + newMM;
  const newEndMin = newStartMin + durationMinutes;
  const overlapsExisting = (otherSchedules ?? []).some((other) => {
    if (scheduleId && other.id === scheduleId) return false;
    const [oh, om] = other.start_time.split(":").map(Number);
    const otherStartMin = oh * 60 + om;
    const otherEndMin = otherStartMin + other.duration_minutes;
    return newStartMin < otherEndMin && newEndMin > otherStartMin;
  });

  if (overlapsExisting) {
    return NextResponse.json(
      { error: "this overlaps with another weekly slot this student already has that day" },
      { status: 409 },
    );
  }

  // The coach side of the same problem: a different student could
  // already have a recurring slot with this coach that overlaps the new
  // one — nothing before this checked that, so two students could each
  // get "confirmed" onto the same coach at the same time. Recurring vs.
  // recurring is a guaranteed-forever conflict (unlike a one-off booked
  // session, below), so this hard-blocks rather than just warning.
  const { data: coachSchedules } = await supabase
    .from("recurring_schedules")
    .select("id, start_time, duration_minutes, students(name)")
    .eq("coach_id", effectiveCoachId)
    .eq("day_of_week", dayOfWeek);

  const coachConflict = (coachSchedules ?? []).find((other) => {
    if (scheduleId && other.id === scheduleId) return false;
    const [oh, om] = other.start_time.split(":").map(Number);
    const otherStartMin = oh * 60 + om;
    const otherEndMin = otherStartMin + other.duration_minutes;
    return newStartMin < otherEndMin && newEndMin > otherStartMin;
  });

  if (coachConflict) {
    const otherStudent = coachConflict.students as unknown as { name: string } | null;
    return NextResponse.json(
      {
        error: otherStudent?.name
          ? `the coach already has ${otherStudent.name} booked at an overlapping time that day`
          : "the coach already has another student booked at an overlapping time that day",
      },
      { status: 409 },
    );
  }

  // One-off bookings (a makeup, a trial, a reassigned session) aren't a
  // recurring pattern, so they can't be checked the same structural way
  // — but the coach could still already have a real session sitting
  // right at this new slot's very next occurrence. This doesn't hard-
  // block (a single incidental booking weeks out shouldn't stop the
  // whole recurring setup — materializeRecurringSessions below already
  // skips just that one instant and keeps the rest, same as it does for
  // any other already-taken slot), but the response's `skipped` count
  // lets the caller warn the admin rather than silently under-booking.
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
  // history and stays untouched regardless. Adding a new slot
  // (scheduleId omitted) skips all of this — there's no prior pattern to
  // clear, and every other schedule this student already has is left
  // completely alone.
  let existingSchedule: { id: string } | null = null;
  if (scheduleId) {
    const { data } = await supabase
      .from("recurring_schedules")
      .select("id")
      .eq("id", scheduleId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "schedule not found" }, { status: 404 });
    }
    existingSchedule = data;

    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("recurring_schedule_id", existingSchedule.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date(`${effectiveStartDate}T00:00:00Z`).toISOString());

    // RLS blocking a delete doesn't error, it just matches zero rows
    // (same gotcha migration 0041 already flagged for update) — this is
    // exactly what let old occurrences of a changed schedule silently
    // survive alongside the new ones (migration 0054 fixes the missing
    // policy; this still fails loudly if that regresses).
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  const scheduleRow = {
    student_id: studentId,
    coach_id: effectiveCoachId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    duration_minutes: durationMinutes,
    start_date: effectiveStartDate,
    cadence: cadence === "biweekly" ? "biweekly" : "weekly",
    active: true,
    updated_at: new Date().toISOString(),
  };

  const { data: schedule, error } = existingSchedule
    ? await supabase
        .from("recurring_schedules")
        .update(scheduleRow)
        .eq("id", existingSchedule.id)
        .select("id")
        .single()
    : await supabase.from("recurring_schedules").insert(scheduleRow).select("id").single();

  if (error) {
    // 23505 = unique_violation — recurring_schedules_student_day_time_key
    // (migration 0076) rejects a second slot at the exact same day/time
    // this student already has (adding, not editing, hits this; editing
    // can't since it's excluded by its own eq("id", ...) above).
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "this student already has a weekly slot at that day/time" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = await materializeRecurringSessions(supabase, { scheduleId: schedule.id });

  // Surface the coach-availability signal rather than letting it hide
  // inside a bare success response — materializeRecurringSessions
  // silently skips any instant the coach is already busy at (its own
  // coachTaken check, across the full year-ahead horizon, not just the
  // next occurrence), so a schedule can "save successfully" while
  // quietly generating fewer sessions than the admin expects.
  const warning = conflictingSession
    ? "heads up: the coach already has another booking at this slot's very next occurrence — that date (and possibly others) won't have gotten a session"
    : result.skipped > 0
      ? `heads up: ${result.skipped} occurrence(s) in the next year were skipped because the coach or student already had something else booked then`
      : null;

  return NextResponse.json({ success: true, ...result, warning });
}

export async function DELETE(req: NextRequest) {
  const { scheduleId } = await req.json();
  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: schedule } = await supabase
    .from("recurring_schedules")
    .select("id")
    .eq("id", scheduleId)
    .maybeSingle();

  if (!schedule) {
    return NextResponse.json({ error: "no recurring schedule found" }, { status: 404 });
  }

  const { error: deleteSessionsError } = await supabase
    .from("sessions")
    .delete()
    .eq("recurring_schedule_id", schedule.id)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString());

  if (deleteSessionsError) {
    return NextResponse.json({ error: deleteSessionsError.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("recurring_schedules")
    .delete()
    .eq("id", schedule.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
