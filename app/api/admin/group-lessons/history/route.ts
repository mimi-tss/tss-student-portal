import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Everything the main GET /api/admin/group-lessons deliberately leaves
// out: cancelled lessons (any date) and past ones that ran — that route
// only ever shows upcoming, not-cancelled lessons, so there was no way to
// look back at what happened or why something got cancelled. Same shape
// as that route plus cancelled_at/cancel_reason, with an optional
// from/to date-range filter.
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  let query = supabase
    .from("group_lessons")
    .select(
      "id, topic, scheduled_at, duration_minutes, max_students, coach_id, cancelled_at, cancel_reason, coaches(name), group_lesson_registrations(id, student_id, status, students(name))",
    )
    .or(`cancelled_at.not.is.null,scheduled_at.lt.${new Date().toISOString()}`)
    .order("scheduled_at", { ascending: false })
    .limit(200);

  if (from) query = query.gte("scheduled_at", from);
  if (to) query = query.lte("scheduled_at", to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    groupLessons: (data ?? []).map((g) => ({
      id: g.id,
      topic: g.topic,
      scheduledAt: g.scheduled_at,
      durationMinutes: g.duration_minutes,
      maxStudents: g.max_students,
      coachId: g.coach_id,
      coachName: unwrapJoin(g.coaches as unknown as { name: string } | { name: string }[] | null)?.name ?? "Coach",
      cancelledAt: g.cancelled_at,
      cancelReason: g.cancel_reason,
      attendees: (
        (g.group_lesson_registrations as unknown as {
          id: string;
          student_id: string;
          status: string;
          students: { name: string } | { name: string }[] | null;
        }[]) ?? []
      ).map((r) => ({
        registrationId: r.id,
        studentId: r.student_id,
        studentName: unwrapJoin(r.students)?.name ?? "Student",
        status: r.status,
      })),
    })),
  });
}
