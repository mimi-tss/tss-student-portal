import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudentRecordings } from "@/lib/google/drive";
import { creditDisplayName } from "@/lib/booking/credit-display";
import { FormattedDate, FormattedTime } from "@/components/formatted-time";
import NotesPanel from "@/components/notes-panel";
import ChatPanel from "@/components/chat-panel";
import { currentBillingCycleRange, CYCLE_SESSION_CAP } from "@/lib/scheduling/recurring";
import JoinButton from "./join-button";
import CancelButton from "./cancel-button";
import UpcomingSessions from "./upcoming-sessions";
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
      "id, name, tier, drive_folder_id, assigned_coach_id, session_duration_minutes, billing_anniversary_date",
    )
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  // Matches the cap windows enforced by the makeup_credits insert RLS
  // policy (migration 0012) — calendar month/year, not billing-anniversary.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const { start: cycleStart, end: cycleEnd } = currentBillingCycleRange(
    student.billing_anniversary_date,
  );

  const [
    { data: coach },
    { data: nextSession },
    { count: monthlyCreditsUsed },
    { count: yearlyCreditsUsed },
    { data: availableCredits },
    { count: sessionsThisCycle },
    { data: spotlightNotes },
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
      .select("id, scheduled_at, duration_minutes, is_makeup")
      .eq("student_id", student.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
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
      .not("status", "in", "(cancelled-with-notice,cancelled-no-notice)")
      .gte("scheduled_at", cycleStart.toISOString())
      .lt("scheduled_at", cycleEnd.toISOString()),
    // Most recent homework note, pinned ones first — spotlighted above
    // the full list, same source of truth (RLS-scoped to this student).
    supabase
      .from("homework_notes")
      .select("id, note, created_at, coaches(name)")
      .eq("student_id", student.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const spotlightNote = spotlightNotes?.[0] ?? null;
  const spotlightCoachName = (() => {
    const c = spotlightNote?.coaches as { name: string } | { name: string }[] | null | undefined;
    if (!c) return "Coach";
    return Array.isArray(c) ? (c[0]?.name ?? "Coach") : c.name;
  })();

  const recordings = student.drive_folder_id
    ? await listStudentRecordings(student.drive_folder_id)
    : [];

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
              <div style={{ marginTop: 10 }}>
                <CancelButton
                  key={nextSession.id}
                  sessionId={nextSession.id}
                  scheduledAt={nextSession.scheduled_at}
                  isMakeup={nextSession.is_makeup}
                  monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
                  yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
                />
              </div>
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

      {spotlightNote && (
        <div className={styles.note}>
          <div className={styles.noteFrom}>Notes from Coach {spotlightCoachName}</div>
          <p className={styles.noteText}>{spotlightNote.note}</p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <UpcomingSessions
          monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
          yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
        />
      </div>

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

      <div className={styles.grid2}>
        <div className={styles.folderPanel}>
          <div className={styles.folderHeader}>
            <span>🎵</span>
            <span>Your recordings</span>
          </div>
          {!student.drive_folder_id && (
            <p className={styles.emptyState}>
              Recordings will appear here once your coach records a session.
            </p>
          )}
          {student.drive_folder_id && recordings.length === 0 && (
            <p className={styles.emptyState}>No recordings yet.</p>
          )}
          {recordings.length > 0 && (
            <div className={styles.folderList}>
              {recordings.map((file) => (
                <a
                  key={file.id}
                  href={file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.folderItem}
                >
                  <div className={styles.ficon}>🎵</div>
                  <div className={styles.finfo}>
                    <div className={styles.fname}>{file.name}</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className={styles.panel}>
          <h3>Your plan</h3>
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
          <Link
            href="/student/book"
            className={styles.cta}
            style={{ marginTop: 16, display: "block", textAlign: "center" }}
          >
            Book / reschedule a session
          </Link>
        </div>
      </div>
    </div>
  );
}
