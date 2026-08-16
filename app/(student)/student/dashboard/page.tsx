import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudentRecordings } from "@/lib/google/drive";
import JoinButton from "./join-button";

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
    .select("id, name, drive_folder_id, assigned_coach_id")
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  const [{ data: coach }, { data: nextSession }] = await Promise.all([
    student.assigned_coach_id
      ? supabase
          .from("coaches")
          .select("meet_link")
          .eq("id", student.assigned_coach_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sessions")
      .select("scheduled_at, duration_minutes")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const recordings = student.drive_folder_id
    ? await listStudentRecordings(student.drive_folder_id)
    : [];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-semibold">Welcome, {student.name}</h1>

      {nextSession && (
        <div className="mb-6 flex items-center justify-between rounded border p-4">
          <p>Next session: {new Date(nextSession.scheduled_at).toLocaleString()}</p>
          {coach?.meet_link && (
            <JoinButton
              scheduledAt={nextSession.scheduled_at}
              durationMinutes={nextSession.duration_minutes}
              meetLink={coach.meet_link}
            />
          )}
        </div>
      )}

      <Link
        href="/student/book"
        className="mb-8 inline-block rounded bg-black px-4 py-2 text-white"
      >
        Book / reschedule a session
      </Link>

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
