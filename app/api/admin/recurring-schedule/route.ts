import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyCoachRecurringScheduleEvent } from "@/lib/notifications/session-events";
import { createRecurringSchedule } from "@/lib/admin/create-recurring-schedule";

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Admin sets a student's recurring weekly lesson slot(s) (spec sections
// 4/5). Creating/updating immediately materializes real `sessions` rows
// via the same logic the daily cron top-up uses, so the change shows up
// on the coach calendar right away rather than waiting for tomorrow's run.
//
// A student can have more than one schedule row now (migration 0076 —
// e.g. paying for 2x/week). `scheduleId` distinguishes the two cases: if
// given, this changes THAT existing slot; if omitted, this ADDS a new
// slot alongside whatever the student already has. All the checks and
// the write itself live in lib/admin/create-recurring-schedule.ts,
// shared with CSV bulk import and student self-setup.
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

  const supabase = await createClient();

  const result = await createRecurringSchedule(supabase, {
    studentId,
    scheduleId,
    dayOfWeek,
    startTime,
    durationMinutes,
    startDate,
    coachId,
    cadence,
    notifyCoach: true,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    created: result.created,
    skipped: result.skipped,
    warning: result.warning ? `heads up: ${result.warning}` : null,
  });
}

export async function DELETE(req: NextRequest) {
  const { scheduleId } = await req.json();
  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: schedule } = await supabase
    .from("recurring_schedules")
    .select(
      "id, day_of_week, start_time, coach_id, students(name), coaches(timezone, slack_webhook_url)",
    )
    .eq("id", scheduleId)
    .maybeSingle();

  if (!schedule) {
    return NextResponse.json({ error: "no recurring schedule found" }, { status: 404 });
  }

  const scheduleStudent = unwrapJoin(schedule.students as unknown as { name: string } | { name: string }[] | null);
  const scheduleCoach = unwrapJoin(
    schedule.coaches as unknown as
      | { timezone: string; slack_webhook_url: string | null }
      | { timezone: string; slack_webhook_url: string | null }[]
      | null,
  );

  const { error: deleteSessionsError } = await supabase
    .from("sessions")
    .delete()
    .eq("recurring_schedule_id", schedule.id)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString());

  if (deleteSessionsError) {
    return NextResponse.json({ error: deleteSessionsError.message }, { status: 500 });
  }

  // Not a real delete: any student who's had this schedule longer than a
  // few days has real past sessions (attended, no-show, a prior cancel)
  // still pointing at it via sessions.recurring_schedule_id, and that FK
  // has no ON DELETE clause — an actual DELETE here always 23503s once
  // real history exists, which is every established student, not an edge
  // case. `active = false` is the same off-switch
  // materializeRecurringSessions and getHeldRecurringSlots already treat
  // as "this schedule doesn't generate/hold anything anymore" (both
  // query `.eq("active", true)`) — flipping it here stops future
  // occurrences the same way a real delete would, without touching the
  // history rows the FK is protecting.
  const { error } = await supabase
    .from("recurring_schedules")
    .update({ active: false })
    .eq("id", schedule.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (scheduleStudent && scheduleCoach) {
    await notifyCoachRecurringScheduleEvent({
      coachId: schedule.coach_id,
      coachSlackWebhookUrl: scheduleCoach.slack_webhook_url,
      coachTimezone: scheduleCoach.timezone,
      studentName: scheduleStudent.name,
      dayOfWeek: schedule.day_of_week,
      startTime: schedule.start_time,
      startDate: "", // unused for the "removed" text
      kind: "recurring_schedule_removed",
      scheduleId: schedule.id,
    });
  }

  return NextResponse.json({ success: true });
}
