import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGroupLesson } from "@/lib/group-lessons";

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Upcoming group lessons across all coaches, with rosters — admin's
// management view. RLS ("admins can manage group lessons") covers the
// authorization.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_lessons")
    .select(
      "id, topic, scheduled_at, duration_minutes, max_students, coach_id, coaches(name), group_lesson_registrations(id, student_id, status, students(name))",
    )
    .is("cancelled_at", null)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at");

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

export async function POST(req: NextRequest) {
  const { coachId, scheduledAt, durationMinutes, topic, maxStudents } = await req.json();

  if (!coachId || !scheduledAt) {
    return NextResponse.json({ error: "coachId and scheduledAt required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const id = await createGroupLesson(supabase, {
      coachId,
      scheduledAt,
      durationMinutes: Number(durationMinutes) || 60,
      topic: topic || null,
      maxStudents: maxStudents ? Number(maxStudents) : null,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't create group lesson" },
      { status: 500 },
    );
  }
}
