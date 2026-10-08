import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWeeklySetupState } from "@/lib/scheduling/weekly-setup";
import WeeklyLessonClient from "./weekly-lesson-client";

// Self-serve setup of a new Pro/Elite student's weekly 1:1 lesson. Linked
// from the Stripe checkout success page, a dashboard banner and the book
// page while the student has no weekly slot. Students often arrive in the
// Kajabi app's in-app browser, so this is a plain page + fetch, no popups
// or new windows.
export default async function WeeklyLessonPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("students")
    .select("id, tier, assigned_coach_id, session_duration_minutes, subscription_status, payment_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) redirect("/login");

  let state;
  try {
    state = await loadWeeklySetupState(createAdminClient(), student);
  } catch (err) {
    console.error("weekly-lesson page: state failed", err);
    return (
      <Message title="Something went wrong">
        We couldn&apos;t load this page. Please refresh, or message the studio from your dashboard.
      </Message>
    );
  }

  if (state.kind === "has_schedule") {
    return (
      <Message title="Your weekly lesson is set up">
        You can see your upcoming lessons on your dashboard. To change your regular day or time, message the studio
        from your dashboard chat.
      </Message>
    );
  }

  if (state.kind === "not_eligible") {
    return <Message title="Weekly lessons aren't available yet">{state.reason}</Message>;
  }

  if (state.coaches.length === 0) {
    return (
      <Message title="No coaches available right now">
        Please message the studio from your dashboard and we&apos;ll set up your weekly lesson for you.
      </Message>
    );
  }

  return (
    <WeeklyLessonClient
      coaches={state.coaches}
      lockedCoachId={state.lockedCoachId}
      preselectedCoachId={state.preselectedCoachId}
      durationMinutes={state.durationMinutes}
    />
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-8 text-[var(--text)]">
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <p className="mb-4 text-[var(--text-muted)]">{children}</p>
      <Link
        href="/student/dashboard"
        className="inline-block rounded-lg bg-[var(--gold)] px-4 py-2 font-bold text-[var(--gold-text)]"
      >
        Go to my dashboard
      </Link>
    </main>
  );
}
