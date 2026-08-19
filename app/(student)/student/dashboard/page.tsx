import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudentRecordings } from "@/lib/google/drive";
import { creditDisplayName } from "@/lib/booking/credit-display";
import JoinButton from "./join-button";
import CancelButton from "./cancel-button";
import UpcomingSessions from "./upcoming-sessions";

// Student dashboard: next session + Join button (opens 10 min early,
// section [today's addition]), recordings from their own Drive
// subfolder, and the booking link. See TSS_App_Spec_1.md section 8.
export default async function StudentDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("students")
    .select("id, name, drive_folder_id, assigned_coach_id, session_duration_minutes")
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  // Matches the cap windows enforced by the makeup_credits insert RLS
  // policy (migration 0012) — calendar month/year, not billing-anniversary.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [
    { data: coach },
    { data: nextSession },
    { count: monthlyCreditsUsed },
    { count: yearlyCreditsUsed },
    { data: availableCredits },
  ] = await Promise.all([
    student.assigned_coach_id
      ? supabase
          .from("coaches")
          .select("meet_link")
          .eq("id", student.assigned_coach_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, is_makeup")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
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
    // Unused, unexpired credits of any type — what's actually spendable
    // right now (see "See remaining session credits" in spec section 8).
    supabase
      .from("makeup_credits")
      .select("id, expires_at, duration_minutes")
      .eq("student_id", student.id)
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false }),
  ]);

  const recordings = student.drive_folder_id
    ? await listStudentRecordings(student.drive_folder_id)
    : [];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">Welcome, {student.name}</h1>

      {nextSession && (
        <div className="mb-6 rounded border p-4">
          <div className="flex items-center justify-between">
            <p>Next session: {new Date(nextSession.scheduled_at).toLocaleString()}</p>
            {coach?.meet_link && (
              <JoinButton
                scheduledAt={nextSession.scheduled_at}
                durationMinutes={nextSession.duration_minutes}
                meetLink={coach.meet_link}
              />
            )}
          </div>
          <div className="mt-3">
            <CancelButton
              key={nextSession.id}
              sessionId={nextSession.id}
              scheduledAt={nextSession.scheduled_at}
              isMakeup={nextSession.is_makeup}
              monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
              yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
            />
          </div>
        </div>
      )}

      <div className="mb-6 rounded border p-4 text-sm">
        <p className="font-medium">
          {availableCredits && availableCredits.length > 0
            ? `${availableCredits.length} session credit${availableCredits.length > 1 ? "s" : ""} available`
            : "No session credits available"}
        </p>
        {availableCredits && availableCredits.length > 0 && (
          <ul className="mt-1 text-gray-600">
            {availableCredits.map((credit) => (
              <li key={credit.id}>
                {creditDisplayName(credit.duration_minutes ?? student.session_duration_minutes ?? 30)}
                {" — "}
                {credit.expires_at
                  ? `expires ${new Date(credit.expires_at).toLocaleDateString()}`
                  : "no expiration"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/student/book"
        className="mb-4 inline-block rounded bg-black px-4 py-2 text-white"
      >
        Book / reschedule a session
      </Link>

      <div className="mb-8">
        <UpcomingSessions
          monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
          yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
        />
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Your recordings</h2>

      {!student.drive_folder_id && (
        <p className="text-gray-500">
          Recordings will appear here once your coach records a session.
        </p>
      )}

      {student.drive_folder_id && recordings.length === 0 && (
        <p className="text-gray-500">No recordings yet.</p>
      )}

      <ul className="space-y-2">
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
    </main>
  );
}
