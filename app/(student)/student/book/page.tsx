import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { FormattedDateTime } from "@/components/formatted-time";
import BookingClient from "./booking-client";
import CancelButton from "../dashboard/cancel-button";
import styles from "../../student.module.css";

// BookingClient is shared with admin's book-on-behalf-of page — both now
// render in the shared dark theme via var()-based Tailwind classes (same
// cross-route-group approach as components/shared-folder-panel.tsx), so
// it no longer needs a light "legacy card" wrapper to look right.
//
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
//
// Cancelling any upcoming session also happens here now, not on the
// dashboard — the "Book / reschedule a session" button on the dashboard
// links straight to this page, and this is the only place a student can
// cancel (decided: one place to manage the schedule, not two).
export default async function BookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("students")
    .select("id, assigned_coach_id, tier, billing_anniversary_date")
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  if (student.tier === "pro" || student.tier === "elite") {
    // Unused, unexpired credits — what's actually spendable on this
    // booking right now (spec section 8: "see remaining session credits").
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
    const { end: cycleEnd } = currentBillingCycleRange(student.billing_anniversary_date);

    const [{ data: credits }, { data: upcomingSessions }, { count: monthlyCreditsUsed }, { count: yearlyCreditsUsed }] =
      await Promise.all([
        supabase
          .from("makeup_credits")
          .select("id, expires_at, duration_minutes")
          .eq("student_id", student.id)
          .eq("used", false)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order("expires_at", { ascending: true, nullsFirst: false }),
        supabase
          .from("sessions")
          .select("id, scheduled_at, duration_minutes, is_makeup")
          .eq("student_id", student.id)
          .eq("status", "scheduled")
          .gte("scheduled_at", now.toISOString())
          .lt("scheduled_at", cycleEnd.toISOString())
          .order("scheduled_at"),
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

    return (
      <div className={styles.wrap}>
        {upcomingSessions && upcomingSessions.length > 0 && (
          <div className={styles.panel} style={{ marginTop: 32, marginBottom: 24 }}>
            <h2>Upcoming sessions this cycle</h2>
            <ul className={styles.sessionList}>
              {upcomingSessions.map((s) => (
                <li key={s.id} className={styles.sessionListItem}>
                  <p className={styles.statValue} style={{ margin: "0 0 8px" }}>
                    <FormattedDateTime value={s.scheduled_at} />
                  </p>
                  <CancelButton
                    sessionId={s.id}
                    scheduledAt={s.scheduled_at}
                    isMakeup={s.is_makeup}
                    monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
                    yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <BookingClient
          studentId={student.id}
          mode="full"
          coachId={student.assigned_coach_id}
          credits={credits ?? []}
          // Students never self-book a plain session — their weekly lessons
          // come from the admin-set recurring schedule, so this page is only
          // for redeeming a credit (section 5).
          canBookWithoutCredit={false}
        />
      </div>
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

  // No new bookings available (trial already used, no purchased-addon
  // credit) — but a just-booked trial (or a one-off admin-booked session)
  // can still be sitting scheduled, and this is the only place to cancel
  // it, so show it here rather than leaving the student with no way to
  // manage a session they can already see on the dashboard.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [{ data: upcomingSessions }, { count: monthlyCreditsUsed }, { count: yearlyCreditsUsed }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, is_makeup")
        .eq("student_id", student.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", now.toISOString())
        .order("scheduled_at"),
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

  return (
    <div className={styles.wrap}>
      {upcomingSessions && upcomingSessions.length > 0 && (
        <div className={styles.panel} style={{ marginTop: 32, marginBottom: 24 }}>
          <h2>Upcoming sessions</h2>
          <ul className={styles.sessionList}>
            {upcomingSessions.map((s) => (
              <li key={s.id} className={styles.sessionListItem}>
                <p className={styles.statValue} style={{ margin: "0 0 8px" }}>
                  <FormattedDateTime value={s.scheduled_at} />
                </p>
                <CancelButton
                  sessionId={s.id}
                  scheduledAt={s.scheduled_at}
                  isMakeup={s.is_makeup}
                  monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
                  yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="mx-auto max-w-lg p-8 text-[var(--text)]">
        <h1 className="mb-2 text-xl font-semibold">Book a session</h1>
        <p className="text-[var(--text-muted)]">
          Your plan doesn&apos;t include new bookings right now — you can still
          view past recordings and homework notes from your dashboard.
          Upgrade to Pro for weekly sessions.
        </p>
      </main>
    </div>
  );
}
