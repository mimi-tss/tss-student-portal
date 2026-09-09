import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentBillingCycleRange } from "@/lib/scheduling/recurring";
import { FormattedDateTime } from "@/components/formatted-time";
import { getUnusedGroupLessonCredits, getRedeemableGroupLessons } from "@/lib/group-lesson-credits";
import BookingClient from "./booking-client";
import CancelButton from "../dashboard/cancel-button";
import GroupLessonCancelButton from "../dashboard/group-lesson-cancel-button";
import GroupLessonCreditPanel, { type CreditWithOptions } from "@/components/group-lesson-credit-panel";
import styles from "../../student.module.css";

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface UpcomingGroupLessonRegistration {
  registrationId: string;
  topic: string | null;
  scheduledAt: string;
  durationMinutes: number;
  coachName: string;
}

// The student's own upcoming, still-registered group classes — a
// completely separate list from GroupLessonCreditPanel (which only ever
// shows unspent credits, not live registrations). This is the only place
// a student can cancel one of these (same "one place to manage the
// schedule" decision as 1:1 sessions above). RLS's own "students can view
// their own registrations" policy (0031) covers this without needing the
// admin client.
async function loadUpcomingGroupLessonRegistrations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
): Promise<UpcomingGroupLessonRegistration[]> {
  const { data } = await supabase
    .from("group_lesson_registrations")
    .select(
      "id, group_lessons!inner(topic, scheduled_at, duration_minutes, cancelled_at, coaches(name))",
    )
    .eq("student_id", studentId)
    .eq("status", "registered")
    .is("group_lessons.cancelled_at", null)
    .gte("group_lessons.scheduled_at", new Date().toISOString());

  return (data ?? [])
    .map((r) => {
      const lesson = unwrapJoin(
        r.group_lessons as unknown as
          | {
              topic: string | null;
              scheduled_at: string;
              duration_minutes: number;
              coaches: { name: string } | { name: string }[] | null;
            }
          | {
              topic: string | null;
              scheduled_at: string;
              duration_minutes: number;
              coaches: { name: string } | { name: string }[] | null;
            }[]
          | null,
      );
      if (!lesson) return null;
      return {
        registrationId: r.id,
        topic: lesson.topic,
        scheduledAt: lesson.scheduled_at,
        durationMinutes: lesson.duration_minutes,
        coachName: unwrapJoin(lesson.coaches)?.name ?? "Coach",
      };
    })
    .filter((r): r is UpcomingGroupLessonRegistration => r !== null)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

// Group class credits (migration 0086) apply regardless of base tier —
// Lite is already blocked at the layout level, but a Suite/Pro/Elite
// student who was the sole registrant of an auto-cancelled group class
// should see their credit here no matter which branch below they land
// in. Uses the admin client for the same reason
// lib/group-lesson-credits.ts's own comment gives: reading other
// students' registration counts on lessons this student isn't in yet is
// outside their own RLS visibility.
async function loadGroupLessonCredits(studentId: string): Promise<CreditWithOptions[]> {
  const admin = createAdminClient();
  const credits = await getUnusedGroupLessonCredits(admin, studentId);
  return Promise.all(
    credits.map(async (c) => ({
      creditId: c.id,
      topic: c.topic,
      expiresAt: c.expiresAt,
      options: await getRedeemableGroupLessons(admin, c.topic, studentId),
    })),
  );
}

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

  const [groupLessonCredits, upcomingGroupLessons] = await Promise.all([
    loadGroupLessonCredits(student.id),
    loadUpcomingGroupLessonRegistrations(supabase, student.id),
  ]);

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

        {upcomingGroupLessons.length > 0 && (
          <div className={styles.panel} style={{ marginTop: 32, marginBottom: 24 }}>
            <h2>Upcoming group classes</h2>
            <ul className={styles.sessionList}>
              {upcomingGroupLessons.map((g) => (
                <li key={g.registrationId} className={styles.sessionListItem}>
                  <p className={styles.statValue} style={{ margin: "0 0 8px" }}>
                    {g.topic || "Group Lesson"} — <FormattedDateTime value={g.scheduledAt} />
                  </p>
                  <p className={styles.panelText} style={{ margin: "0 0 8px" }}>
                    with Coach {g.coachName} · {g.durationMinutes} min
                  </p>
                  <GroupLessonCancelButton
                    registrationId={g.registrationId}
                    scheduledAt={g.scheduledAt}
                    topic={g.topic}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <GroupLessonCreditPanel credits={groupLessonCredits} />

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
    .select("used, coach_id")
    .eq("student_id", student.id)
    .eq("perk_type", "trial_lesson")
    .maybeSingle();

  if (entitlement && !entitlement.used) {
    return (
      <div className={styles.wrap}>
        {upcomingGroupLessons.length > 0 && (
          <div className={styles.panel} style={{ marginTop: 32, marginBottom: 24 }}>
            <h2>Upcoming group classes</h2>
            <ul className={styles.sessionList}>
              {upcomingGroupLessons.map((g) => (
                <li key={g.registrationId} className={styles.sessionListItem}>
                  <p className={styles.statValue} style={{ margin: "0 0 8px" }}>
                    {g.topic || "Group Lesson"} — <FormattedDateTime value={g.scheduledAt} />
                  </p>
                  <p className={styles.panelText} style={{ margin: "0 0 8px" }}>
                    with Coach {g.coachName} · {g.durationMinutes} min
                  </p>
                  <GroupLessonCancelButton
                    registrationId={g.registrationId}
                    scheduledAt={g.scheduledAt}
                    topic={g.topic}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <GroupLessonCreditPanel credits={groupLessonCredits} />
        {/* A trial granted for a specific coach (migration 0093 — e.g. a
            student who paid extra for a trial with Tara specifically)
            skips straight to date/time for that coach — BookingClient's
            own "pick a coach first" screen only shows when coachId is
            null. */}
        <BookingClient studentId={student.id} mode="trial" coachId={entitlement.coach_id} />
      </div>
    );
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

      <GroupLessonCreditPanel credits={groupLessonCredits} />

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
