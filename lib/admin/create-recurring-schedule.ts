import { SupabaseClient } from "@supabase/supabase-js";
import { materializeRecurringSessions, nextWeeklySlotInstant, slotFitsWorkingHours } from "@/lib/scheduling/recurring";

export interface CreateRecurringScheduleInput {
  studentId: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  startDate?: string | null;
  coachId?: string | null;
  cadence?: "weekly" | "biweekly";
}

export type CreateRecurringScheduleResult =
  | { success: true; warning: string | null }
  | { success: false; error: string };

// Shared by the CSV bulk-import route (its only caller — the admin
// single-add route has its own edit-or-add-a-schedule-row logic in
// app/api/admin/recurring-schedule/route.ts, since it has to handle
// changing an existing slot as well as adding a new one). This helper
// only ever creates a schedule for a brand-new student, so
// existingSchedule below is always empty in practice; it's kept as
// defensive cleanup rather than assumed. A student can have more than
// one recurring_schedules row now (migration 0076 dropped the
// one-per-student constraint), so this is a plain insert, not an
// upsert — inserting a genuine duplicate day/time is caught by the
// new (student_id, day_of_week, start_time) unique constraint instead.
// Accepts either the RLS-scoped session client or the service-role
// admin client (bulk import), same dual-acceptance as
// materializeRecurringSessions.
export async function createRecurringSchedule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: CreateRecurringScheduleInput,
): Promise<CreateRecurringScheduleResult> {
  const { studentId, dayOfWeek, startTime, durationMinutes, coachId, cadence } = input;

  const effectiveStartDate: string = input.startDate || new Date().toISOString().slice(0, 10);

  const { data: student } = await supabase
    .from("students")
    .select("id, assigned_coach_id, billing_anniversary_date")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) {
    return { success: false, error: "student not found" };
  }

  const effectiveCoachId: string | null = coachId || student.assigned_coach_id;

  if (!effectiveCoachId) {
    return { success: false, error: "assign a coach before setting a recurring schedule" };
  }

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

  if (!slotFitsWorkingHours(coach?.working_hours ?? {}, dayOfWeek, startTime, durationMinutes)) {
    return { success: false, error: "that time falls outside the coach's working hours" };
  }

  // Same coach-availability checks app/api/admin/recurring-schedule's
  // own route runs for the single-add flow — CSV import shares the same
  // real risk of double-booking a coach across two different students
  // (or landing on a standing block), just for a brand-new student
  // instead of an existing one.
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
    return { success: false, error: "that time is blocked off on the coach's calendar (e.g. a standing meeting or break)" };
  }

  const { data: coachSchedules } = await supabase
    .from("recurring_schedules")
    .select("id, start_time, duration_minutes, students(name)")
    .eq("coach_id", effectiveCoachId)
    .eq("day_of_week", dayOfWeek);

  const [newHH, newMM] = startTime.split(":").map(Number);
  const newStartMin = newHH * 60 + newMM;
  const newEndMin = newStartMin + durationMinutes;
  const coachConflict = (coachSchedules ?? []).find((other: { start_time: string; duration_minutes: number }) => {
    const [oh, om] = other.start_time.split(":").map(Number);
    const otherStartMin = oh * 60 + om;
    const otherEndMin = otherStartMin + other.duration_minutes;
    return newStartMin < otherEndMin && newEndMin > otherStartMin;
  });

  if (coachConflict) {
    const otherStudent = coachConflict.students as unknown as { name: string } | null;
    return {
      success: false,
      error: otherStudent?.name
        ? `the coach already has ${otherStudent.name} booked at an overlapping time that day`
        : "the coach already has another student booked at an overlapping time that day",
    };
  }

  const { data: conflictingSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("actual_coach_id", effectiveCoachId)
    .eq("scheduled_at", nextInstant.toISOString())
    .not("status", "eq", "cancelled-with-notice")
    .maybeSingle();

  const { data: existingSchedule } = await supabase
    .from("recurring_schedules")
    .select("id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (existingSchedule) {
    const { error: deleteError } = await supabase
      .from("sessions")
      .delete()
      .eq("recurring_schedule_id", existingSchedule.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date(`${effectiveStartDate}T00:00:00Z`).toISOString());

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }
  }

  const { data: schedule, error } = await supabase
    .from("recurring_schedules")
    .insert({
      student_id: studentId,
      coach_id: effectiveCoachId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      duration_minutes: durationMinutes,
      start_date: effectiveStartDate,
      cadence: cadence === "biweekly" ? "biweekly" : "weekly",
      active: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "This student already has a weekly slot at that day/time." };
    }
    return { success: false, error: error.message };
  }

  const result = await materializeRecurringSessions(supabase, { scheduleId: schedule.id });

  const warning = conflictingSession
    ? "the coach already has another booking at this slot's very next occurrence — that date (and possibly others) won't have gotten a session"
    : result.skipped > 0
      ? `${result.skipped} occurrence(s) in the next year were skipped because the coach already had something else booked then`
      : null;

  return { success: true, warning };
}
