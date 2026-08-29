import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  materializeRecurringSessions,
  slotFitsWorkingHours,
  nextWeeklySlotInstant,
} from "@/lib/scheduling/recurring";

// Admin sets a student's recurring weekly lesson slot (spec sections 4/5)
// — the only way a student's regular sessions get scheduled; students
// can't self-book them (see app/api/booking/book/route.ts) or change the
// time themselves, only contact the studio. Creating/updating
// immediately materializes real `sessions` rows via the same logic the
// daily cron top-up uses, so the change shows up on the coach calendar
// right away rather than waiting for tomorrow's run.
export async function POST(req: NextRequest) {
  const { studentId, dayOfWeek, startTime, durationMinutes, startDate, coachId, cadence } =
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

  // Replacing an existing schedule (new day/time, or reassigned coach):
  // drop its own not-yet-happened, untouched occurrences from the new
  // start date onward, so the old slot doesn't linger alongside the new
  // one. Occurrences BEFORE the new start date belong to the old pattern
  // and are deliberately left in place — that's how "Fridays 3:30pm
  // starting now, Fridays 6pm starting Oct 1" keeps the September
  // Friday-3:30pm sessions intact. Anything already cancelled or
  // attended is real history and stays untouched regardless.
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

    // RLS blocking a delete doesn't error, it just matches zero rows
    // (same gotcha migration 0041 already flagged for update) — this is
    // exactly what let old occurrences of a changed schedule silently
    // survive alongside the new ones (migration 0054 fixes the missing
    // policy; this still fails loudly if that regresses).
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = await materializeRecurringSessions(supabase, { scheduleId: schedule.id });

  return NextResponse.json({ success: true, ...result });
}

export async function DELETE(req: NextRequest) {
  const { studentId } = await req.json();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: schedule } = await supabase
    .from("recurring_schedules")
    .select("id")
    .eq("student_id", studentId)
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
