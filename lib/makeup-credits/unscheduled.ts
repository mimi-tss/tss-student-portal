import { SupabaseClient } from "@supabase/supabase-js";

export interface UnscheduledCredit {
  id: string;
  studentId: string;
  studentEmail: string;
  studentPhone: string | null;
  studentName: string;
  type: string;
  createdAt: string;
  expiresAt: string | null;
  durationMinutes: number;
}

// Unused, unscheduled makeup credits, any type (including non-expiring
// studio-emergency/studio-planned — unlike getMakeupsExpiringSoon /
// attention-items' credit_expiring, which are deliberately narrower:
// student-fault only, expiry-gated). "Idle" = created at least
// minAgeDays ago, so a credit issued minutes ago from a just-cancelled
// session doesn't get nudged before the student's had a chance to book
// it themselves. Already-expired credits are excluded — nothing to book.
export async function getUnscheduledMakeupCredits(
  admin: SupabaseClient,
  minAgeDays = 3,
): Promise<UnscheduledCredit[]> {
  const cutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000);

  const { data } = await admin
    .from("makeup_credits")
    .select("id, student_id, type, created_at, expires_at, duration_minutes, students(id, name, email, phone, archived)")
    .eq("used", false)
    .is("used_session_id", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .lte("created_at", cutoff.toISOString());

  return (data ?? [])
    .map((c) => {
      const student = (
        Array.isArray(c.students) ? c.students[0] : c.students
      ) as { id: string; name: string; email: string; phone: string | null; archived: boolean } | null;
      if (!student || student.archived) return null;
      return {
        id: c.id as string,
        studentId: student.id,
        studentEmail: student.email,
        studentPhone: student.phone,
        studentName: student.name,
        type: c.type as string,
        createdAt: c.created_at as string,
        expiresAt: (c.expires_at as string | null) ?? null,
        durationMinutes: (c.duration_minutes as number | null) ?? 30,
      };
    })
    .filter((c): c is UnscheduledCredit => c !== null);
}
