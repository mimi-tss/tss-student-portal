import { SupabaseClient } from "@supabase/supabase-js";
import { materializeRecurringSessions, slotFitsWorkingHours } from "@/lib/scheduling/recurring";

export interface CreateRecurringScheduleInput {
  studentId: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  startDate?: string | null;
  coachId?: string | null;
  cadence?: "weekly" | "biweekly";
}

export type CreateRecurringScheduleResult = { success: true } | { success: false; error: string };

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
    .select("working_hours")
    .eq("id", effectiveCoachId)
    .single();

  if (!slotFitsWorkingHours(coach?.working_hours ?? {}, dayOfWeek, startTime, durationMinutes)) {
    return { success: false, error: "that time falls outside the coach's working hours" };
  }

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

  await materializeRecurringSessions(supabase, { scheduleId: schedule.id });

  return { success: true };
}
