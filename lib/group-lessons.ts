import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface GroupLessonAttendee {
  registrationId: string;
  studentId: string;
  studentName: string;
  status: "registered" | "attended" | "no-show";
}

export interface CoachGroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  attendees: GroupLessonAttendee[];
}

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// A coach's own group lessons in a date range, with attendee rosters —
// feeds both the calendar grid (green cells) and Today's Schedule.
export async function getCoachGroupLessons(
  supabase: SupabaseClient,
  coachId: string,
  start: string,
  end: string,
): Promise<CoachGroupLesson[]> {
  const { data: lessons } = await supabase
    .from("group_lessons")
    .select(
      "id, topic, scheduled_at, duration_minutes, group_lesson_registrations(id, student_id, status, students(name))",
    )
    .eq("coach_id", coachId)
    .is("cancelled_at", null)
    .gte("scheduled_at", start)
    .lte("scheduled_at", end)
    .order("scheduled_at");

  return (lessons ?? []).map((l) => ({
    id: l.id,
    topic: l.topic,
    scheduledAt: l.scheduled_at,
    durationMinutes: l.duration_minutes,
    attendees: (
      (l.group_lesson_registrations as unknown as {
        id: string;
        student_id: string;
        status: "registered" | "attended" | "no-show";
        students: { name: string } | { name: string }[] | null;
      }[]) ?? []
    ).map((r) => ({
      registrationId: r.id,
      studentId: r.student_id,
      studentName: unwrapJoin(r.students)?.name ?? "Student",
      status: r.status,
    })),
  }));
}

export interface StudentGroupLesson {
  id: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  coachName: string;
}

// Upcoming group lessons a student is registered for — shown on their
// dashboard the same way a trial lesson is (spec: "still be on
// dashboard similar to trial lesson"), even though the billing/
// registration path is entirely separate (Stripe, admin-confirmed).
export async function getStudentUpcomingGroupLessons(
  supabase: SupabaseClient,
  studentId: string,
): Promise<StudentGroupLesson[]> {
  const { data: registrations } = await supabase
    .from("group_lesson_registrations")
    .select("group_lessons(id, topic, scheduled_at, duration_minutes, coaches(name))")
    .eq("student_id", studentId);

  const now = Date.now();
  return (registrations ?? [])
    .map((r) => {
      const lesson = unwrapJoin(
        r.group_lessons as unknown as
          | { id: string; topic: string | null; scheduled_at: string; duration_minutes: number; coaches: { name: string } | { name: string }[] | null }
          | { id: string; topic: string | null; scheduled_at: string; duration_minutes: number; coaches: { name: string } | { name: string }[] | null }[]
          | null,
      );
      if (!lesson) return null;
      return {
        id: lesson.id,
        topic: lesson.topic,
        scheduledAt: lesson.scheduled_at,
        durationMinutes: lesson.duration_minutes,
        coachName: unwrapJoin(lesson.coaches)?.name ?? "Coach",
      };
    })
    .filter((l): l is StudentGroupLesson => !!l && new Date(l.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

// Admin-only creation (spec: "can only be added by admin") — enforced by
// RLS ("admins can manage group lessons" is a `for all using(is_admin())`
// policy, migration 0031), not re-checked here; a non-admin's insert
// simply gets rejected by the database, same posture as
// app/api/admin/add-credit/route.ts.
export async function createGroupLesson(
  supabase: SupabaseClient,
  params: { coachId: string; scheduledAt: string; durationMinutes: number; topic?: string | null },
): Promise<string> {
  const { data, error } = await supabase
    .from("group_lessons")
    .insert({
      coach_id: params.coachId,
      scheduled_at: params.scheduledAt,
      duration_minutes: params.durationMinutes,
      topic: params.topic ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return data.id;
}

// Admin manually confirms the Stripe payment came through, then
// registers the student — identical posture to purchased-addon session
// credits (migration 0014): no live Stripe integration, no webhook.
export async function registerStudentInGroupLesson(
  supabase: SupabaseClient,
  params: { groupLessonId: string; studentId: string; stripeReference?: string | null },
): Promise<void> {
  const { error } = await supabase.from("group_lesson_registrations").insert({
    group_lesson_id: params.groupLessonId,
    student_id: params.studentId,
    stripe_reference: params.stripeReference ?? null,
  });
  if (error) throw new Error(error.message);
}
