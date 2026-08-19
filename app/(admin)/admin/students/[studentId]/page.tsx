import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudentRecordings } from "@/lib/google/drive";
import { creditDisplayName, creditTypeLabel } from "@/lib/booking/credit-display";
import { FormattedDate, FormattedDateTime } from "@/components/formatted-time";
import NotesPanel from "@/components/notes-panel";
import AdminCancelButtons from "./admin-cancel-buttons";
import RecurringScheduleClient from "./recurring-schedule-client";
import AdminUpcomingSessions from "./admin-upcoming-sessions";
import ReassignSessionCoach from "./reassign-session-coach";

// Read-only admin view of what a student sees on their own dashboard —
// next session, credit balance, recordings — without impersonating their
// session. Reached by clicking a student's name from the admin dashboard.
export default async function AdminStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, name, email, tier, subscription_status, drive_folder_id, assigned_coach_id, session_duration_minutes",
    )
    .eq("id", studentId)
    .maybeSingle();

  if (!student) notFound();

  // Matches the cap windows enforced server-side (lib/booking/cancel-
  // session.ts) — calendar month/year, not billing-anniversary — so the
  // "remaining" count shown before a regular cancel is accurate.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [
    { data: coach },
    { data: nextSession },
    { data: credits },
    { data: recurringSchedule },
    { data: coaches },
    { count: monthlyCreditsUsed },
    { count: yearlyCreditsUsed },
  ] = await Promise.all([
    student.assigned_coach_id
      ? supabase
          .from("coaches")
          .select("name, timezone")
          .eq("id", student.assigned_coach_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, status, actual_coach_id, is_makeup")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("makeup_credits")
      .select("id, type, used, expires_at, reason, duration_minutes")
      .eq("student_id", student.id)
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("recurring_schedules")
      .select("day_of_week, start_time, duration_minutes, start_date, coach_id")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase.from("coaches").select("id, name").order("name"),
    supabase
      .from("makeup_credits")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .eq("type", "student-fault")
      .gte("created_at", monthStart),
    supabase
      .from("makeup_credits")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .eq("type", "student-fault")
      .gte("created_at", yearStart),
  ]);

  // The recurring schedule's coach can now differ from the student's
  // overall assigned_coach_id (admin can set them independently — see
  // recurring-schedule-client.tsx) — fetch its own timezone for the
  // display conversion rather than assuming it matches `coach` above.
  const { data: scheduleCoach } = recurringSchedule?.coach_id
    ? await supabase
        .from("coaches")
        .select("timezone")
        .eq("id", recurringSchedule.coach_id)
        .maybeSingle()
    : { data: null };

  const recordings = student.drive_folder_id
    ? await listStudentRecordings(student.drive_folder_id)
    : [];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/admin/dashboard" className="mb-4 inline-block text-sm text-blue-600 underline">
        ← Back to students
      </Link>

      <h1 className="mb-1 text-xl font-semibold">{student.name}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {student.email} · {student.tier} · {student.subscription_status}
        {coach ? ` · coach: ${coach.name}` : " · no coach assigned"}
      </p>

      <div className="mb-6 rounded border p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-500">Weekly schedule</h2>
        <RecurringScheduleClient
          studentId={student.id}
          hasCoach={!!student.assigned_coach_id}
          defaultCoachId={student.assigned_coach_id}
          coachTimeZone={scheduleCoach?.timezone ?? coach?.timezone ?? null}
          coaches={coaches ?? []}
          schedule={
            recurringSchedule
              ? {
                  dayOfWeek: recurringSchedule.day_of_week,
                  startTime: recurringSchedule.start_time,
                  durationMinutes: recurringSchedule.duration_minutes,
                  startDate: recurringSchedule.start_date,
                  coachId: recurringSchedule.coach_id,
                }
              : null
          }
        />
      </div>

      <div className="mb-6 rounded border p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">Next session</h2>
          <Link
            href={`/admin/students/${student.id}/book`}
            className="text-sm text-blue-600 underline"
          >
            Book a session
          </Link>
        </div>
        {nextSession ? (
          <>
            <p>
              <FormattedDateTime value={nextSession.scheduled_at} />
            </p>
            <div className="mt-1 flex items-center gap-3">
              <AdminCancelButtons
                key={nextSession.id}
                sessionId={nextSession.id}
                scheduledAt={nextSession.scheduled_at}
                isMakeup={nextSession.is_makeup}
                monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
                yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
              />
              <ReassignSessionCoach
                sessionId={nextSession.id}
                currentCoachId={nextSession.actual_coach_id}
                coaches={coaches ?? []}
              />
            </div>
          </>
        ) : (
          <p className="text-gray-500">Nothing scheduled.</p>
        )}
      </div>

      <div className="mb-6">
        <AdminUpcomingSessions
          studentId={student.id}
          coaches={coaches ?? []}
          monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
          yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
        />
      </div>

      <div className="mb-6 rounded border p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-500">Session credits</h2>
        {credits && credits.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {credits.map((c) => (
              <li key={c.id}>
                <p>
                  {creditDisplayName(c.duration_minutes ?? student.session_duration_minutes ?? 30)}
                  {" — "}
                  {c.expires_at ? (
                    <>
                      expires <FormattedDate value={c.expires_at} />
                    </>
                  ) : (
                    "no expiration"
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {creditTypeLabel(c.type)}
                  {c.reason ? ` - ${c.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">None available.</p>
        )}
      </div>

      <div className="mb-6 rounded border p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Homework notes</h2>
        <NotesPanel studentId={student.id} />
      </div>

      <div className="rounded border p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-500">Recordings</h2>
        {recordings.length === 0 && <p className="text-gray-500">None yet.</p>}
        <ul className="space-y-1 text-sm">
          {recordings.map((file) => (
            <li key={file.id}>
              <a
                href={file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {file.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
