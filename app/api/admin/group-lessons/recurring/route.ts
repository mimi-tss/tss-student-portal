import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createRecurringGroupLessonSeries,
  deactivateRecurringGroupLessonSeries,
  getActiveRecurringGroupLessons,
} from "@/lib/group-lessons";

// Admin's recurring group lesson series management — separate from
// app/api/admin/group-lessons/route.ts (one-off lessons), same relation
// as app/api/admin/recurring-schedule/route.ts is to regular booking.
// Authorization is enforced by RLS ("admins can manage recurring group
// lessons", migration 0053), not re-checked here — same posture as the
// one-off route.
export async function GET() {
  const supabase = await createClient();
  const series = await getActiveRecurringGroupLessons(supabase);
  return NextResponse.json({ series });
}

export async function POST(req: NextRequest) {
  const { coachId, topic, dayOfWeek, startTime, durationMinutes, maxStudents, startDate, endDate } =
    await req.json();

  if (!coachId || dayOfWeek === undefined || dayOfWeek === null || !startTime || !startDate) {
    return NextResponse.json(
      { error: "coachId, dayOfWeek, startTime, and startDate are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  try {
    const id = await createRecurringGroupLessonSeries(supabase, {
      coachId,
      topic: topic || null,
      dayOfWeek: Number(dayOfWeek),
      startTime,
      durationMinutes: Number(durationMinutes) || 60,
      maxStudents: maxStudents ? Number(maxStudents) : null,
      startDate,
      endDate: endDate || null,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't create the recurring series" },
      { status: 500 },
    );
  }
}

// Stops future occurrences from being generated — already-materialized
// future group_lessons rows are left alone (see
// deactivateRecurringGroupLessonSeries's own comment for why).
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();

  try {
    await deactivateRecurringGroupLessonSeries(supabase, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't stop the series" },
      { status: 500 },
    );
  }
}
