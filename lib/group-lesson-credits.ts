import type { SupabaseClient } from "@supabase/supabase-js";

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface GroupLessonCredit {
  id: string;
  topic: string;
  expiresAt: string | null;
  createdAt: string;
}

// Unused, unexpired credits — granted only by the group-lesson-understaffed
// cron when a class it auto-cancels leaves exactly one registered student
// holding nothing to show for it. A student cancelling their own
// registration never lands here (no such self-cancel path exists for
// group lessons today — only admin can unregister someone).
export async function getUnusedGroupLessonCredits(
  admin: SupabaseClient,
  studentId: string,
): Promise<GroupLessonCredit[]> {
  const { data } = await admin
    .from("group_lesson_credits")
    .select("id, topic, expires_at, created_at")
    .eq("student_id", studentId)
    .eq("used", false)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at");

  return (data ?? []).map((c) => ({
    id: c.id,
    topic: c.topic,
    expiresAt: c.expires_at,
    createdAt: c.created_at,
  }));
}

export interface RedeemableGroupLesson {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  coachName: string;
  spotsLeft: number | null; // null = uncapped
}

// Future, non-cancelled occurrences of the given topic that still have
// room and this student isn't already registered in — what a credit
// (same topic, per the studio's own "another group class in the same
// name" description) can actually be redeemed against. Uses the admin
// client deliberately: a student has no RLS visibility into a
// group_lessons row they aren't registered in yet (0056), and this is a
// read of everyone else's registration counts too, not just their own —
// same posture as app/api/shared-folder/notify-upload/route.ts (verify
// ownership with the user's session, then use the admin client for the
// actual cross-student work).
export async function getRedeemableGroupLessons(
  admin: SupabaseClient,
  topic: string,
  excludeStudentId: string,
): Promise<RedeemableGroupLesson[]> {
  const { data } = await admin
    .from("group_lessons")
    .select("id, scheduled_at, duration_minutes, max_students, coaches(name), group_lesson_registrations(student_id)")
    .eq("topic", topic)
    .is("cancelled_at", null)
    .gt("scheduled_at", new Date().toISOString())
    .order("scheduled_at");

  return (data ?? [])
    .map((l) => {
      const registrations = (l.group_lesson_registrations as unknown as { student_id: string }[] | null) ?? [];
      const alreadyRegistered = registrations.some((r) => r.student_id === excludeStudentId);
      if (alreadyRegistered) return null;

      const coach = unwrapJoin(l.coaches as unknown as { name: string } | { name: string }[] | null);
      const spotsLeft = l.max_students === null ? null : l.max_students - registrations.length;
      if (spotsLeft !== null && spotsLeft <= 0) return null;

      return {
        id: l.id,
        scheduledAt: l.scheduled_at,
        durationMinutes: l.duration_minutes,
        coachName: coach?.name ?? "Coach",
        spotsLeft,
      };
    })
    .filter((l): l is RedeemableGroupLesson => l !== null);
}
