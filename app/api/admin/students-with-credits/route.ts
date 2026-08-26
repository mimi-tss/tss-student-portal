import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Powers the Coaches page's "book with a makeup credit" quick-book —
// admin clicks an open slot on a coach's column, picks a student from
// this list, then one of that student's own available credits. Only
// returns students who currently have at least one unused, unexpired
// credit — nothing else to pick from otherwise. Paused students are
// still listed (their pause is enforced at booking time by
// /api/booking/book, admin is exempt) so admin can override there if
// truly needed, same "admin ⊇ student" exemption used elsewhere.
export async function GET() {
  const supabase = await createClient();

  const { data: credits } = await supabase
    .from("makeup_credits")
    .select("id, student_id, type, duration_minutes, expires_at, students(name)")
    .eq("used", false)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("expires_at", { ascending: true, nullsFirst: false });

  const byStudent = new Map<
    string,
    { studentId: string; studentName: string; credits: { id: string; type: string; durationMinutes: number | null; expiresAt: string | null }[] }
  >();

  for (const c of credits ?? []) {
    const name = (c.students as unknown as { name: string } | null)?.name ?? "Student";
    const existing = byStudent.get(c.student_id);
    const entry = { id: c.id, type: c.type, durationMinutes: c.duration_minutes, expiresAt: c.expires_at };
    if (existing) {
      existing.credits.push(entry);
    } else {
      byStudent.set(c.student_id, { studentId: c.student_id, studentName: name, credits: [entry] });
    }
  }

  return NextResponse.json({ students: [...byStudent.values()].sort((a, b) => a.studentName.localeCompare(b.studentName)) });
}
