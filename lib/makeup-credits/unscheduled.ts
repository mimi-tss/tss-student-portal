import { SupabaseClient } from "@supabase/supabase-js";

export interface UnscheduledCredit {
  id: string;
  studentId: string;
  studentEmail: string;
  studentPhone: string | null;
  studentName: string;
  type: string;
  createdAt: string;
}

// Unused, unscheduled makeup credits, any type (including non-expiring
// studio-emergency/studio-planned — unlike getMakeupsExpiringSoon /
// attention-items' credit_expiring, which are deliberately narrower:
// student-fault only, expiry-gated). "Idle" = created at least
// minAgeDays ago, so a credit issued minutes ago from a just-cancelled
// session doesn't get nudged before the student's had a chance to book
// it themselves.
export async function getUnscheduledMakeupCredits(
  admin: SupabaseClient,
  minAgeDays = 3,
): Promise<UnscheduledCredit[]> {
  const cutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000);

  const { data } = await admin
    .from("makeup_credits")
    .select("id, student_id, type, created_at, students(id, name, email, phone, archived)")
    .eq("used", false)
    .is("used_session_id", null)
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
      };
    })
    .filter((c): c is UnscheduledCredit => c !== null);
}
