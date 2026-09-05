import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAssignedExercises } from "@/lib/exercises";
import { getStudentUpcomingGroupLessons } from "@/lib/group-lessons";
import { renewalInfo } from "@/lib/billing/renewal";
import { creditDisplayName } from "@/lib/booking/credit-display";
import { FormattedDate, FormattedDateTime, FormattedTime } from "@/components/formatted-time";
import ChatPanel from "@/components/chat-panel";
import { currentBillingCycleRange, effectiveSessionCycleCap } from "@/lib/scheduling/recurring";
import JoinButton from "./join-button";
import StreakPing from "./streak-ping";
import PlanRequestsClient from "./plan-requests-client";
import NotificationPreferencesClient from "./notification-preferences-client";
import SharedFolderPanel from "@/components/shared-folder-panel";
import ExercisePlayer from "@/components/exercise-player";
import styles from "../../student.module.css";

const TIER_LABEL: Record<string, string> = {
  suite: "Sing Smarter Suite",
  pro: "Sing Smarter Pro",
  elite: "Sing Smarter Elite",
};

// Short form used only for ambassadors ("Pro (Ambassador)") — the full
// TIER_LABEL names would read as "Sing Smarter Pro (Ambassador)", longer
// than the admin asked for.
const SHORT_TIER_LABEL: Record<string, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Student dashboard: next session + Join button (opens 10 min early),
// a homework-note spotlight, chat, recordings, and the plan/credit
// summary. See TSS_App_Spec_1.md section 8.
export default async function StudentDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, name, tier, drive_folder_id, assigned_coach_id, session_duration_minutes, billing_anniversary_date, streak_count, ambassador, notify_digest_email, notify_digest_sms, notify_digest_inapp, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp",
    )
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  const now = new Date();
  const { start: cycleStart, end: cycleEnd } = currentBillingCycleRange(
    student.billing_anniversary_date,
  );

  const [
    { data: coach },
    { data: nextSession },
    { data: availableCredits },
    { count: sessionsThisCycle },
    { data: spotlightNotes },
    { data: upcomingCycleSessions },
    { data: pendingRequests },
    { data: recurringSchedules },
  ] = await Promise.all([
    student.assigned_coach_id
      ? supabase
          .from("coaches")
          .select("name, meet_link")
          .eq("id", student.assigned_coach_id)
          .single()
      : Promise.resolve({ data: null }),
    // actual_coach_id, not assigned_coach_id — a session's real teaching
    // coach can differ from the student's overall assigned one (a
    // substitute, or a reassigned session), and the Join button/meet
    // link below must match whoever is actually teaching THIS session,
    // not who the student is generally assigned to.
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, coaches(name, meet_link)")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
    // Unused, unexpired credits of any type — what's actually spendable
    // right now (see "See remaining session credits" in spec section 8).
    supabase
      .from("makeup_credits")
      .select("id, expires_at, duration_minutes")
      .eq("student_id", student.id)
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,paused,holiday)")
      .gte("scheduled_at", cycleStart.toISOString())
      .lt("scheduled_at", cycleEnd.toISOString()),
    // Most recent homework note, pinned ones first — spotlighted above
    // the full list, same source of truth (RLS-scoped to this student).
    supabase
      .from("homework_notes")
      .select("id, note, created_at")
      .eq("student_id", student.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    // Every scheduled session left in this billing cycle — backs the
    // "Upcoming lessons this cycle" card next to "Your plan", which links
    // to the scheduler rather than offering inline cancel (that's still
    // available from the "Next session" card above).
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .lt("scheduled_at", cycleEnd.toISOString())
      .order("scheduled_at"),
    supabase
      .from("student_requests")
      .select("id")
      .eq("student_id", student.id)
      .eq("status", "pending")
      .limit(1),
    supabase
      .from("recurring_schedules")
      .select("cadence")
      .eq("student_id", student.id)
      .eq("active", true),
  ]);

  const sessionCycleCap = effectiveSessionCycleCap(student.tier, (recurringSchedules ?? []).map((s) => s.cadence));

  const hasPendingCancelRequest = (pendingRequests?.length ?? 0) > 0;

  const spotlightNote = spotlightNotes?.[0] ?? null;

  const [assignedExercises, upcomingGroupLessons] = await Promise.all([
    listAssignedExercises(supabase, student.id),
    getStudentUpcomingGroupLessons(supabase, student.id),
  ]);

  const { renewalDate } = renewalInfo(student.billing_anniversary_date);
  const coachFirstName = coach?.name ? firstName(coach.name) : null;

  // The session's own actual teaching coach (may be a substitute,
  // differs from student.assigned_coach_id) — the Join button/meet
  // link for a specific upcoming session must always match whoever is
  // really teaching it, not the student's general assigned coach.
  const nextSessionCoach = nextSession
    ? ((Array.isArray(nextSession.coaches) ? nextSession.coaches[0] : nextSession.coaches) as {
        name: string;
        meet_link: string | null;
      } | null)
    : null;
  const nextSessionCoachFirstName = nextSessionCoach?.name ? firstName(nextSessionCoach.name) : null;

  // "Next session" previously only ever looked at 1:1 sessions, so a
  // sooner group lesson (e.g. a bootcamp) the student is registered
  // for never showed as what's actually coming up next — the hero
  // card would show a 1:1 over a week later instead. Compare both and
  // show whichever is chronologically first.
  const nextGroupLesson = upcomingGroupLessons[0] ?? null;
  const groupLessonIsNext =
    nextGroupLesson !== null &&
    (!nextSession || new Date(nextGroupLesson.scheduledAt).getTime() < new Date(nextSession.scheduled_at).getTime());

  // "Upcoming lessons this cycle" merges 1:1 sessions (which already
  // include any makeup-credit-booked ones — a makeup session is just a
  // regular `sessions` row with `is_makeup`/`makeup_credit_id` set, not
  // a separate table) with group lessons falling inside the same
  // billing cycle, into one chronological list — group lessons
  // previously had their own separate card above this one.
  type CycleItem = {
    id: string;
    scheduledAt: string;
    durationMinutes: number;
    group: { topic: string | null; coachName: string } | null;
  };
  const cycleItems: CycleItem[] = [
    ...(upcomingCycleSessions ?? []).map((s) => ({
      id: s.id,
      scheduledAt: s.scheduled_at,
      durationMinutes: s.duration_minutes,
      group: null,
    })),
    ...upcomingGroupLessons
      .filter((g) => new Date(g.scheduledAt).getTime() < cycleEnd.getTime())
      .map((g) => ({
        id: g.id,
        scheduledAt: g.scheduledAt,
        durationMinutes: g.durationMinutes,
        group: { topic: g.topic, coachName: g.coachName },
      })),
  ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Unused makeup credits (availableCredits above is already scoped to
  // used=false and not-yet-expired) that expire within 14 days — a
  // credit sitting unscheduled that close to expiry is easy to lose
  // track of, so it gets its own loud callout rather than only showing
  // up quietly in the "Your plan" panel below.
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const expiringSoonCredits = (availableCredits ?? []).filter(
    (c) => c.expires_at && new Date(c.expires_at).getTime() <= fourteenDaysFromNow.getTime(),
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.eyebrow}>Welcome back</div>
          <h1 className={styles.heroTitle}>
            Ready to sing smarter today, {firstName(student.name)}?
          </h1>
          <p className={styles.heroText}>
            {groupLessonIsNext
              ? `Your next lesson — ${nextGroupLesson!.topic || "Group Lesson"} — is coming up.`
              : nextSession && nextSessionCoachFirstName
                ? `Your next session with Coach ${nextSessionCoachFirstName} is coming up.`
                : "Book your next session whenever you're ready."}
          </p>
        </div>
        <div className={styles.sessionCard}>
          <div className={styles.sessionLabel}>Next session</div>
          {groupLessonIsNext ? (
            <>
              <div className={styles.sessionTime}>
                <FormattedTime value={nextGroupLesson!.scheduledAt} />
              </div>
              <div className={styles.sessionCoach}>
                <FormattedDate value={nextGroupLesson!.scheduledAt} />
                {` · ${nextGroupLesson!.topic || "Group Lesson"} with Coach ${nextGroupLesson!.coachName}`} ·{" "}
                {nextGroupLesson!.durationMinutes} min
              </div>
              {nextGroupLesson!.meetLink && (
                <JoinButton
                  kind="group_lesson"
                  sessionId={nextGroupLesson!.id}
                  scheduledAt={nextGroupLesson!.scheduledAt}
                  durationMinutes={nextGroupLesson!.durationMinutes}
                  meetLink={nextGroupLesson!.meetLink}
                />
              )}
            </>
          ) : nextSession ? (
            <>
              <div className={styles.sessionTime}>
                <FormattedTime value={nextSession.scheduled_at} />
              </div>
              <div className={styles.sessionCoach}>
                <FormattedDate value={nextSession.scheduled_at} />
                {nextSessionCoachFirstName ? ` · with Coach ${nextSessionCoachFirstName}` : ""} ·{" "}
                {nextSession.duration_minutes} min
              </div>
              {nextSessionCoach?.meet_link && (
                <JoinButton
                  kind="session"
                  sessionId={nextSession.id}
                  scheduledAt={nextSession.scheduled_at}
                  durationMinutes={nextSession.duration_minutes}
                  meetLink={nextSessionCoach.meet_link}
                />
              )}
            </>
          ) : (
            <>
              <p className={styles.sessionEmpty}>Nothing scheduled yet.</p>
              <Link href="/student/book" className={styles.cta} style={{ marginTop: 10, padding: "9px 16px", fontSize: 13 }}>
                Book a session
              </Link>
            </>
          )}
        </div>
      </div>

      {expiringSoonCredits.length > 0 && (
        <Link href="/student/book" className={styles.expiringWarning}>
          {expiringSoonCredits.map((c) => (
            <div key={c.id}>
              MAKEUP EXPIRING SOON ON <FormattedDate value={c.expires_at as string} />, SCHEDULE IT NOW.
            </div>
          ))}
        </Link>
      )}

      {spotlightNote && (
        <div className={styles.note}>
          <div className={styles.noteFrom}>Homework Notes</div>
          <p className={styles.noteText}>{spotlightNote.note}</p>
        </div>
      )}

      <StreakPing initialCount={student.streak_count ?? 0} />

      <div className={styles.sectionTitle}>
        <h2>Chat{coachFirstName ? ` with Coach ${coachFirstName}` : ""}</h2>
        <Link href="/student/chat" className={styles.linkBtn}>
          Open full chat →
        </Link>
      </div>
      <ChatPanel studentId={student.id} currentProfileId={user.id} />

      <div className={styles.sectionTitle}>
        <h2>Your exercises</h2>
      </div>
      <div className={styles.exercisePanel}>
        {assignedExercises.length === 0 ? (
          <p className={styles.emptyState}>Nothing assigned yet.</p>
        ) : (
          <ul className={styles.exerciseList}>
            {assignedExercises.map((ex) => (
              <li key={ex.id} className={styles.exerciseItem}>
                <div className={styles.exerciseIcon}>🎵</div>
                <div className={styles.exerciseInfo}>
                  <div className={styles.exerciseTitle}>{ex.title}</div>
                  {ex.description && <div className={styles.exerciseMeta}>{ex.description}</div>}
                  {ex.audioUrl && (
                    <div style={{ marginTop: 8 }}>
                      <ExercisePlayer src={ex.audioUrl} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.sectionTitle}>
        <h2>Shared folder</h2>
      </div>
      {student.drive_folder_id ? (
        <SharedFolderPanel studentId={student.id} />
      ) : (
        <p className={styles.panelText}>
          Your shared folder will appear here once your coach records a session.
        </p>
      )}

      <div className={styles.sectionTitle} style={{ marginTop: 44 }}>
        <h2>Your plan</h2>
      </div>
      <div className={styles.grid2}>
        <div className={styles.panel}>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Membership</div>
            <div className={styles.statValue}>
              <span className={styles.tierBadge}>
                {student.ambassador
                  ? `${SHORT_TIER_LABEL[student.tier] ?? student.tier} (Ambassador)`
                  : TIER_LABEL[student.tier] ?? student.tier}
              </span>
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Coach</div>
            <div className={styles.statValue}>{coach?.name ?? "Not yet assigned"}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Sessions this cycle</div>
            <div className={styles.statValue}>
              {sessionsThisCycle ?? 0}
              {sessionCycleCap !== null ? ` of ${sessionCycleCap} used` : ""}
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Makeup credits</div>
            <div className={styles.statValue}>
              {availableCredits && availableCredits.length > 0
                ? `${availableCredits.length} available`
                : "None available"}
            </div>
          </div>
          {availableCredits && availableCredits.length > 0 && (
            <p className={styles.panelText} style={{ marginTop: 10 }}>
              {availableCredits.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && <br />}
                  {creditDisplayName(c.duration_minutes ?? student.session_duration_minutes ?? 30)}
                  {" — "}
                  {c.expires_at ? (
                    <>
                      expires <FormattedDate value={c.expires_at} />
                    </>
                  ) : (
                    "no expiration"
                  )}
                </span>
              ))}
            </p>
          )}
          <p className={styles.panelText} style={{ marginTop: 10 }}>
            Renews <FormattedDate value={renewalDate.toISOString()} />.
          </p>
          <Link
            href="/student/book"
            className={styles.cta}
            style={{ marginTop: 16, display: "block", textAlign: "center" }}
          >
            Book / reschedule a session
          </Link>
          <PlanRequestsClient initialPending={hasPendingCancelRequest} renewalDate={renewalDate.toISOString()} />
          <NotificationPreferencesClient
            initial={{
              notify_digest_email: student.notify_digest_email,
              notify_digest_sms: student.notify_digest_sms,
              notify_digest_inapp: student.notify_digest_inapp,
              notify_alerts_email: student.notify_alerts_email,
              notify_alerts_sms: student.notify_alerts_sms,
              notify_alerts_inapp: student.notify_alerts_inapp,
            }}
          />
        </div>

        <Link href="/student/book" className={styles.panelLink}>
          <h3>Upcoming lessons this cycle</h3>
          {cycleItems.length > 0 ? (
            <ul className={styles.sessionList}>
              {cycleItems.map((item) => (
                <li key={item.id} className={styles.sessionListItem}>
                  <p className={styles.statValue} style={{ margin: 0 }}>
                    {item.group ? `${item.group.topic || "Group Lesson"} — ` : ""}
                    <FormattedDateTime value={item.scheduledAt} />
                  </p>
                  <p className={styles.panelText}>
                    {item.group ? `with Coach ${item.group.coachName} · ` : ""}
                    {item.durationMinutes} min
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.panelText}>Nothing else scheduled this cycle.</p>
          )}
        </Link>
      </div>
    </div>
  );
}
