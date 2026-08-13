import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Computes open slots for the student's own assigned coach:
// coach working_hours minus coach_blocks minus existing sessions.
// See TSS_App_Spec_1.md section 5 ("Coach availability").

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const LOOKAHEAD_DAYS = 14;
const SLOT_MINUTES = 30;

type WorkingHours = Record<string, [string, string][]>;

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("assigned_coach_id")
    .eq("id", studentId)
    .single();

  if (!student?.assigned_coach_id) {
    return NextResponse.json({ slots: [] });
  }

  const coachId = student.assigned_coach_id;

  const { data: coach } = await supabase
    .from("coaches")
    .select("working_hours")
    .eq("id", coachId)
    .single();

  const workingHours = (coach?.working_hours ?? {}) as WorkingHours;

  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const [{ data: blocks }, { data: existingSessions }] = await Promise.all([
    supabase
      .from("coach_blocks")
      .select("start_at, end_at")
      .eq("coach_id", coachId)
      .lte("start_at", horizon.toISOString())
      .gte("end_at", now.toISOString()),
    supabase
      .from("sessions")
      .select("scheduled_at, duration_minutes")
      .eq("actual_coach_id", coachId)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizon.toISOString())
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice)"),
  ]);

  const busyRanges = [
    ...(blocks ?? []).map((b) => [new Date(b.start_at), new Date(b.end_at)] as const),
    ...(existingSessions ?? []).map((s) => {
      const start = new Date(s.scheduled_at);
      const end = new Date(start.getTime() + s.duration_minutes * 60 * 1000);
      return [start, end] as const;
    }),
  ];

  const slots: Slot[] = [];

  for (let d = 0; d < LOOKAHEAD_DAYS; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const windows = workingHours[DAY_KEYS[day.getDay()]] ?? [];

    for (const [winStart, winEnd] of windows) {
      const [startH, startM] = winStart.split(":").map(Number);
      const [endH, endM] = winEnd.split(":").map(Number);

      const cursor = new Date(day);
      cursor.setHours(startH, startM, 0, 0);
      const windowEnd = new Date(day);
      windowEnd.setHours(endH, endM, 0, 0);

      while (cursor.getTime() + SLOT_MINUTES * 60 * 1000 <= windowEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000);
        const isPast = cursor < now;
        const overlapsBusy = busyRanges.some(
          ([bStart, bEnd]) => cursor < bEnd && slotEnd > bStart,
        );

        if (!isPast && !overlapsBusy) {
          slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
        }

        cursor.setTime(slotEnd.getTime());
      }
    }
  }

  return NextResponse.json({ slots });
}

interface Slot {
  start: string;
  end: string;
}
