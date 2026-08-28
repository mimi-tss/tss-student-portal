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

// Shared by the admin "set a student's recurring slot" route
// (app/api/admin/recurring-schedule/route.ts) and the CSV bulk-import
// route — same validate-working-hours / replace-existing-schedule /
// materialize sequence either way. Accepts either the RLS-scoped session
// client (single-add route, where "admins manage recurring schedules" —
// migration 0020 — already permits the write) or the service-role admin
// client (bulk import), same dual-acceptance as materializeRecurringSessions.
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
    .upsert(
      {
        student_id: studentId,
        coach_id: effectiveCoachId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        duration_minutes: durationMinutes,
        start_date: effectiveStartDate,
        cadence: cadence === "biweekly" ? "biweekly" : "weekly",
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id" },
    )
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  await materializeRecurringSessions(supabase, { scheduleId: schedule.id });

  return { success: true };
}
