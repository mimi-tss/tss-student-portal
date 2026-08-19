import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { creditDisplayName, creditTypeLabel } from "@/lib/booking/credit-display";
import { FormattedDateTime, FormattedDate } from "@/components/formatted-time";
import ChatPanel from "@/components/chat-panel";
import NotesPanel from "@/components/notes-panel";

// A coach's view of one student — "the same student dashboard" no
// matter which coach is looking (current, previous, or a one-off
// substitute — TSS_App_Spec_1.md section 8): chat and homework notes
// carry over in full regardless of coach changes (migration 0022), so
// this page is identical for any coach who's ever had a real session
// with this student. Read-only on scheduling — a coach doesn't cancel
// or rebook on a student's behalf, only admin does.
export default async function CoachStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS already scopes this to students the coach is assigned to or has
  // ever had a real session with (0007/0013) — a coach with no access
  // simply gets no row back, same "404 not 403" pattern as elsewhere.
  const { data: student } = await supabase
    .from("students")
    .select("id, name, tier, subscription_status, session_duration_minutes")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) notFound();

  const [{ data: nextSession }, { data: credits }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("makeup_credits")
      .select("id, type, expires_at, reason, duration_minutes")
      .eq("student_id", student.id)
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false }),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/coach/dashboard" className="mb-4 inline-block text-sm text-blue-600 underline">
        ← Back to schedule
      </Link>

      <h1 className="mb-1 text-xl font-semibold">{student.name}</h1>
      <p className="mb-4 text-sm text-gray-500">
        {student.tier} · {student.subscription_status}
      </p>

      <div className="mb-6 rounded border p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-500">Next session</h2>
        {nextSession ? (
          <p>
            <FormattedDateTime value={nextSession.scheduled_at} />
          </p>
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
        <NotesPanel studentId={student.id} canAdd />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Chat</h2>
        <ChatPanel studentId={student.id} currentProfileId={user.id} />
      </div>
    </main>
  );
}
