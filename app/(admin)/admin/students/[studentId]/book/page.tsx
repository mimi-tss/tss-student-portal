import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookingClient from "@/app/(student)/student/book/booking-client";
import styles from "../../../../admin.module.css";

// Admin books a session on a student's behalf — the same month-calendar
// UI students use themselves (BookingClient), just reachable from the
// admin side. Needed so a purchased-addon credit (Stripe-only extra
// lesson, no Kajabi — section 5) can actually be redeemed, not just
// granted: students can only book against their own assigned coach, and
// this is often how the studio confirms a Stripe payment and schedules
// the lesson in one motion.
export default async function AdminBookStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  // creditId: set when admin clicked "Book" next to a specific credit
  // on the student's own page, instead of landing here generically —
  // locks the booking to spend that exact credit.
  searchParams: Promise<{ creditId?: string }>;
}) {
  const { studentId } = await params;
  const { creditId } = await searchParams;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, name, assigned_coach_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) notFound();

  const [{ data: credits }, { data: coaches }] = await Promise.all([
    supabase
      .from("makeup_credits")
      .select("id, expires_at, duration_minutes")
      .eq("student_id", student.id)
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    supabase.from("coaches").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div>
      <div className={styles.wrap} style={{ paddingBottom: 0 }}>
        <Link
          href={`/admin/students/${student.id}`}
          className={styles.backLink}
          style={{ marginBottom: 0 }}
        >
          ← Back to {student.name}
        </Link>
      </div>
      <BookingClient
        studentId={student.id}
        mode="full"
        coachId={student.assigned_coach_id}
        credits={credits ?? []}
        initialCreditId={creditId}
        // Admin ⊇ student: admin can book a plain session on a student's
        // behalf even with no credit on file, which students can't do.
        canBookWithoutCredit
        // Admin ⊇ student: admin can book with a different coach than
        // the student's assigned one (e.g. redeeming a makeup with a
        // substitute) — students always book against their assigned
        // coach only.
        allCoaches={coaches ?? []}
      />
    </div>
  );
}
