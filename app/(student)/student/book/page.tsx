import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookingClient from "./booking-client";

// Booking/reschedule flow — deliberately its own route, separate from
// /student/dashboard, so it can be linked to directly (e.g. from a
// reschedule notification) without loading the full dashboard. Still inside
// the (student) route group, so it shares the same Supabase auth session
// and backend as the rest of the portal.
//
// What a student sees here depends on tier + trial status (section 2):
// Pro/Elite get full booking against their assigned coach; Suite with an
// unused trial gets a one-time any-coach trial booking; everyone else
// (Suite with the trial already used) is view-only — no booking UI at all.
export default async function BookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("students")
    .select("id, assigned_coach_id, tier")
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  if (student.tier === "pro" || student.tier === "elite") {
    // Unused, unexpired credits — what's actually spendable on this
    // booking right now (spec section 8: "see remaining session credits").
    const { data: credits } = await supabase
      .from("makeup_credits")
      .select("id, expires_at, duration_minutes")
      .eq("student_id", student.id)
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false });

    return (
      <BookingClient
        studentId={student.id}
        mode="full"
        coachId={student.assigned_coach_id}
        credits={credits ?? []}
      />
    );
  }

  // Suite (the only other tier that reaches here — Lite is blocked at the
  // layout level): check for an unused trial-lesson entitlement.
  const { data: entitlement } = await supabase
    .from("entitlements")
    .select("used")
    .eq("student_id", student.id)
    .eq("perk_type", "trial_lesson")
    .maybeSingle();

  if (entitlement && !entitlement.used) {
    return <BookingClient studentId={student.id} mode="trial" coachId={null} />;
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-2 text-xl font-semibold">Book a session</h1>
      <p className="text-gray-500">
        Your plan doesn&apos;t include new bookings right now — you can still
        view past recordings and homework notes from your dashboard.
        Upgrade to Pro for weekly sessions.
      </p>
    </main>
  );
}
