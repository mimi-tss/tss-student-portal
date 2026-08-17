import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudentRecordings } from "@/lib/google/drive";
import { creditDisplayName, creditTypeLabel } from "@/lib/booking/credit-display";
import AdminCancelButtons from "./admin-cancel-buttons";

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

  const [{ data: coach }, { data: nextSession }, { data: credits }] = await Promise.all([
    student.assigned_coach_id
      ? supabase.from("coaches").select("name").eq("id", student.assigned_coach_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, status")
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
  ]);

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
            <p>{new Date(nextSession.scheduled_at).toLocaleString()}</p>
            <AdminCancelButtons key={nextSession.id} sessionId={nextSession.id} />
          </>
        ) : (
          <p className="text-gray-500">Nothing scheduled.</p>
        )}
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
                  {c.expires_at
                    ? `expires ${new Date(c.expires_at).toLocaleDateString()}`
                    : "no expiration"}
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
