import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudentRecordings } from "@/lib/google/drive";
import { listAssignedExercises } from "@/lib/exercises";
import { getStudentUpcomingGroupLessons } from "@/lib/group-lessons";
import { renewalInfo } from "@/lib/billing/renewal";
import { creditDisplayName } from "@/lib/booking/credit-display";
import { FormattedDate, FormattedDateTime, FormattedTime } from "@/components/formatted-time";
import NotesPanel from "@/components/notes-panel";
import ChatPanel from "@/components/chat-panel";
import { currentBillingCycleRange, CYCLE_SESSION_CAP } from "@/lib/scheduling/recurring";
import JoinButton from "./join-button";
import StreakPing from "./streak-ping";
import PlanRequestsClient from "./plan-requests-client";
import SharedFolderPanel from "@/components/shared-folder-panel";
import styles from "../../student.module.css";

const TIER_LABEL: Record<string, string> = {
  suite: "Sing Smarter Suite",
  pro: "Sing Smarter Pro",
  elite: "Sing Smarter Elite",
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
      "id, name, tier, drive_folder_id, assigned_coach_id, session_duration_minutes, billing_anniversary_date, streak_count",
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
  ] = await Promise.all([
    student.assigned_coach_id
      ? supabase
          .from("coaches")
          .select("name, meet_link")
          .eq("id", student.assigned_coach_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes")
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
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,paused)")
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
  ]);

  const hasPendingCancelRequest = (pendingRequests?.length ?? 0) > 0;

  const spotlightNote = spotlightNotes?.[0] ?? null;

  const [recordings, assignedExercises, upcomingGroupLessons] = await Promise.all([
    student.drive_folder_id ? listStudentRecordings(student.drive_folder_id) : Promise.resolve([]),
    listAssignedExercises(supabase, student.id),
    getStudentUpcomingGroupLessons(supabase, student.id),
  ]);

  const { renewalDate } = renewalInfo(student.billing_anniversary_date);
  const coachFirstName = coach?.name ? firstName(coach.name) : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.eyebrow}>Welcome back</div>
          <h1 className={styles.heroTitle}>
            Ready to sing smarter today, {firstName(student.name)}?
          </h1>
          <p className={styles.heroText}>
            {nextSession && coachFirstName
              ? `Your next session with Coach ${coachFirstName} is coming up.`
              : "Book your next session whenever you're ready."}
          </p>
        </div>
        <div className={styles.sessionCard}>
          <div className={styles.sessionLabel}>Next session</div>
          {nextSession ? (
            <>
              <div className={styles.sessionTime}>
                <FormattedTime value={nextSession.scheduled_at} />
              </div>
              <div className={styles.sessionCoach}>
                <FormattedDate value={nextSession.scheduled_at} />
                {coachFirstName ? ` · with Coach ${coachFirstName}` : ""} ·{" "}
                {nextSession.duration_minutes} min
              </div>
              {coach?.meet_link && (
                <JoinButton
                  scheduledAt={nextSession.scheduled_at}
                  durationMinutes={nextSession.duration_minutes}
                  meetLink={coach.meet_link}
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

      {upcomingGroupLessons.length > 0 && (
        <div className={styles.note} style={{ marginTop: 16 }}>
          <div className={styles.noteFrom}>Upcoming group lesson{upcomingGroupLessons.length > 1 ? "s" : ""}</div>
          {upcomingGroupLessons.map((g) => (
            <p key={g.id} className={styles.noteText} style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14 }}>
              {g.topic || "Group Lesson"} — <FormattedDate value={g.scheduledAt} />,{" "}
              <FormattedTime value={g.scheduledAt} /> with Coach {g.coachName} ({g.durationMinutes} min)
            </p>
          ))}
        </div>
      )}

      {spotlightNote && (
        <div className={styles.note}>
          <div className={styles.noteFrom}>Homework Notes</div>
          <p className={styles.noteText}>{spotlightNote.note}</p>
        </div>
      )}

      <StreakPing initialCount={student.streak_count ?? 0} />

      <div className={styles.sectionTitle}>
        <h2>Homework notes</h2>
      </div>
      <NotesPanel studentId={student.id} initialLimit={5} dark />

      <div className={styles.sectionTitle}>
        <h2>Chat{coachFirstName ? ` with Coach ${coachFirstName}` : ""}</h2>
        <Link href="/student/chat" className={styles.linkBtn}>
          Open full chat →
        </Link>
      </div>
      <ChatPanel studentId={student.id} currentProfileId={user.id} dark />

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
                    <audio
                      controls
                      controlsList="nodownload noplaybackrate"
                      src={ex.audioUrl}
                      style={{ width: "100%", marginTop: 8 }}
                    />
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
        <SharedFolderPanel studentId={student.id} initialFiles={recordings} />
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
                {TIER_LABEL[student.tier] ?? student.tier}
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
              {student.tier !== "suite" ? ` of ${CYCLE_SESSION_CAP} used` : ""}
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
          <PlanRequestsClient initialPending={hasPendingCancelRequest} />
        </div>

        <Link href="/student/book" className={styles.panelLink}>
          <h3>Upcoming lessons this cycle</h3>
          {upcomingCycleSessions && upcomingCycleSessions.length > 0 ? (
            <ul className={styles.sessionList}>
              {upcomingCycleSessions.map((s) => (
                <li key={s.id} className={styles.sessionListItem}>
                  <p className={styles.statValue} style={{ margin: 0 }}>
                    <FormattedDateTime value={s.scheduled_at} />
                  </p>
                  <p className={styles.panelText}>{s.duration_minutes} min</p>
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
