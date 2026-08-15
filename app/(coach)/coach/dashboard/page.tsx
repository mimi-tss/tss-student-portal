import { createClient } from "@/lib/supabase/server";

// Coach dashboard: upcoming schedule. See TSS_App_Spec_1.md section 8
// (Coach side) — full version also needs birthdays-this-week and
// credits-expiring-soon; not built yet.
//
// Trial lessons (section 5) render in a distinct color: the "coach sale"
// cue to pitch the discounted Pro upgrade at the end of that session.
export default async function CoachDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, name")
    .eq("profile_id", user!.id)
    .single();

  if (!coach) {
    return (
      <main className="p-8">
        <p className="text-gray-500">No coach record linked to this account yet.</p>
      </main>
    );
  }

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, status, is_trial, students(name)")
    .eq("actual_coach_id", coach.id)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at");

  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">{coach.name}&apos;s Schedule</h1>

      <ul className="space-y-2">
        {(sessions ?? []).map((session) => {
          const studentName =
            (session.students as unknown as { name: string } | null)?.name ?? "Student";

          return (
            <li
              key={session.id}
              className={`flex items-center justify-between rounded border p-3 ${
                session.is_trial ? "border-amber-400 bg-amber-50" : ""
              }`}
            >
              <span>
                {new Date(session.scheduled_at).toLocaleString()} — {studentName}
              </span>
              {session.is_trial && (
                <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-medium text-amber-950">
                  Trial — pitch Pro upgrade
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {(sessions ?? []).length === 0 && (
        <p className="text-gray-500">No upcoming sessions.</p>
      )}
    </main>
  );
}
