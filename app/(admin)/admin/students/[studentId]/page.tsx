import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listStudentRecordings } from "@/lib/google/drive";
import { listAssignedExercises } from "@/lib/exercises";
import { formatTenure } from "@/lib/format-date";
import { renewalInfo } from "@/lib/billing/renewal";
import { creditDisplayName, creditTypeLabel } from "@/lib/booking/credit-display";
import { FormattedDate, FormattedDateTime } from "@/components/formatted-time";
import NotesPanel from "@/components/notes-panel";
import ChatPanel from "@/components/chat-panel";
import SharedFolderPanel from "@/components/shared-folder-panel";
import AssignExercisePanel from "@/components/assign-exercise-panel";
import ExercisePlayer from "@/components/exercise-player";
import AdminCancelButtons from "./admin-cancel-buttons";
import RecurringScheduleClient from "./recurring-schedule-client";
import AdminUpcomingSessions from "./admin-upcoming-sessions";
import ReassignSessionCoach from "./reassign-session-coach";
import BirthDateClient from "./birth-date-client";
import ReferralClient from "./referral-client";
import CoachStartDateClient from "./coach-start-date-client";
import BillingAnniversaryClient from "./billing-anniversary-client";
import SubscriptionLifecycleClient from "./subscription-lifecycle-client";
import StaffNotesClient from "./staff-notes-client";
import styles from "../../../admin.module.css";

const TIER_LABEL: Record<string, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, name, email, tier, subscription_status, drive_folder_id, assigned_coach_id, session_duration_minutes, birth_date, coach_start_date_override, paused_start, paused_end, created_at, billing_anniversary_date, referred_by_coach_id",
    )
    .eq("id", studentId)
    .maybeSingle();

  if (!student) notFound();

  // Matches the cap windows enforced server-side (lib/booking/cancel-
  // session.ts) — calendar month/year, not billing-anniversary — so the
  // "remaining" count shown before a regular cancel is accurate.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [
    { data: coach },
    { data: nextSession },
    { data: credits },
    { data: recurringSchedule },
    { data: coaches },
    { count: monthlyCreditsUsed },
    { count: yearlyCreditsUsed },
    { data: firstSessionWithCoach },
    { data: cancelRequestRow },
  ] = await Promise.all([
    student.assigned_coach_id
      ? supabase
          .from("coaches")
          .select("name, timezone")
          .eq("id", student.assigned_coach_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, status, actual_coach_id, is_makeup")
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
    supabase
      .from("recurring_schedules")
      .select("day_of_week, start_time, duration_minutes, start_date, coach_id")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase.from("coaches").select("id, name").eq("active", true).order("name"),
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
    // Fallback for CoachStartDateClient when no admin override is set —
    // mirrors getStudentSnapshot's own "earliest session this coach
    // actually taught" query (lib/coach/dashboard-data.ts).
    student.assigned_coach_id
      ? supabase
          .from("sessions")
          .select("scheduled_at")
          .eq("student_id", student.id)
          .eq("actual_coach_id", student.assigned_coach_id)
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Drives the Stop panel — a still-open cancellation (student-
    // submitted or admin-flagged via /api/admin/flag-cancellation).
    // "denied" is excluded on purpose: that's the retained outcome, so
    // Stop should go back to showing its default (no active request).
    supabase
      .from("student_requests")
      .select("id, status, reason, effective_date, last_session_override")
      .eq("student_id", student.id)
      .eq("type", "cancel_subscription")
      .in("status", ["pending", "approved"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // The recurring schedule's coach can now differ from the student's
  // overall assigned_coach_id (admin can set them independently — see
  // recurring-schedule-client.tsx) — fetch its own timezone for the
  // display conversion rather than assuming it matches `coach` above.
  const { data: scheduleCoach } = recurringSchedule?.coach_id
    ? await supabase
        .from("coaches")
        .select("timezone")
        .eq("id", recurringSchedule.coach_id)
        .maybeSingle()
    : { data: null };

  const [recordings, exerciseCatalog, assignedExercises, cancelRequestExtras] = await Promise.all([
    student.drive_folder_id ? listStudentRecordings(student.drive_folder_id) : Promise.resolve([]),
    supabase.from("exercises").select("id, title").eq("active", true).order("title"),
    listAssignedExercises(supabase, student.id),
    cancelRequestRow
      ? Promise.all([
          supabase
            .from("attention_items")
            .select("id")
            .eq("request_id", cancelRequestRow.id)
            .in("status", ["needs_action", "in_progress"])
            .maybeSingle(),
          supabase
            .from("sessions")
            .select("scheduled_at")
            .eq("student_id", student.id)
            .eq("status", "scheduled")
            .lte("scheduled_at", `${cancelRequestRow.effective_date}T23:59:59.999Z`)
            .order("scheduled_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
      : Promise.resolve([{ data: null }, { data: null }] as const),
  ]);

  const [{ data: cancelAttentionItem }, { data: lastSessionRow }] = cancelRequestExtras;

  const cancelRequest = cancelRequestRow
    ? {
        attentionItemId: cancelAttentionItem?.id ?? null,
        status: cancelRequestRow.status,
        reason: cancelRequestRow.reason,
        effectiveDate: cancelRequestRow.effective_date as string,
        lastSessionOverride: cancelRequestRow.last_session_override,
      }
    : null;

  const { renewalDate } = renewalInfo(student.billing_anniversary_date);

  return (
    <main className={styles.wrap}>
      <Link href="/admin/dashboard" className={styles.backLink}>
        ← Back to students
      </Link>

      <h1 className={styles.pageTitle} style={{ marginBottom: 16 }}>
        {student.name}
      </h1>

      <div className={styles.overviewGrid} style={{ marginTop: 0, marginBottom: 20 }}>
        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Email</div>
            <div className={styles.statValue}>{student.email}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Membership</div>
            <div className={styles.statValue}>
              <span className={styles.badge}>{TIER_LABEL[student.tier] ?? student.tier}</span>
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Coach</div>
            <div className={styles.statValue}>{coach?.name ?? "Not yet assigned"}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Referred by</div>
            <div className={styles.statValue}>
              <ReferralClient studentId={student.id} initialCoachId={student.referred_by_coach_id} coaches={coaches ?? []} />
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Birthday</div>
            <div className={styles.statValue}>
              <BirthDateClient studentId={student.id} initialValue={student.birth_date} />
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>With coach since</div>
            <div className={styles.statValue}>
              <CoachStartDateClient
                studentId={student.id}
                initialValue={student.coach_start_date_override}
                derivedValue={firstSessionWithCoach?.scheduled_at?.slice(0, 10) ?? null}
              />
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>With us</div>
            <div className={styles.statValue}>{formatTenure(student.created_at)}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Billing cycle anchor</div>
            <div className={styles.statValue}>
              <BillingAnniversaryClient studentId={student.id} initialValue={student.billing_anniversary_date} />
            </div>
          </div>

          <SubscriptionLifecycleClient
            studentId={student.id}
            subscriptionStatus={student.subscription_status}
            hasCoach={!!student.assigned_coach_id}
            hasRecurringSchedule={!!recurringSchedule}
            defaultCoachId={student.assigned_coach_id}
            coachTimeZone={coach?.timezone ?? null}
            coaches={coaches ?? []}
            pausedStart={student.paused_start}
            pausedEnd={student.paused_end}
            billingRenewalDate={renewalDate.toISOString().slice(0, 10)}
            cancelRequest={cancelRequest}
            computedLastSession={lastSessionRow?.scheduled_at?.slice(0, 10) ?? null}
          />
        </div>

        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
            <h2 style={{ margin: 0 }}>Staff notes</h2>
            <span className={styles.badgeWarn}>Admin only</span>
          </div>
          <p className={styles.mutedText} style={{ marginBottom: 12, fontSize: 12 }}>
            Never visible to the coach or student.
          </p>
          <StaffNotesClient studentId={student.id} />
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Weekly schedule</h2>
        <RecurringScheduleClient
          studentId={student.id}
          hasCoach={!!student.assigned_coach_id}
          defaultCoachId={student.assigned_coach_id}
          coachTimeZone={scheduleCoach?.timezone ?? coach?.timezone ?? null}
          coaches={coaches ?? []}
          hideStartPrompt={student.subscription_status === "active"}
          schedule={
            recurringSchedule
              ? {
                  dayOfWeek: recurringSchedule.day_of_week,
                  startTime: recurringSchedule.start_time,
                  durationMinutes: recurringSchedule.duration_minutes,
                  startDate: recurringSchedule.start_date,
                  coachId: recurringSchedule.coach_id,
                }
              : null
          }
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Next session</h2>
          <Link href={`/admin/students/${student.id}/book`} className={styles.linkBtn}>
            Book a session
          </Link>
        </div>
        {nextSession ? (
          <>
            <p>
              <FormattedDateTime value={nextSession.scheduled_at} />
            </p>
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12 }}>
              <AdminCancelButtons
                key={nextSession.id}
                sessionId={nextSession.id}
                scheduledAt={nextSession.scheduled_at}
                isMakeup={nextSession.is_makeup}
                monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
                yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
              />
              <ReassignSessionCoach
                sessionId={nextSession.id}
                currentCoachId={nextSession.actual_coach_id}
                coaches={coaches ?? []}
              />
            </div>
          </>
        ) : (
          <p className={styles.mutedText}>Nothing scheduled.</p>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <AdminUpcomingSessions
          studentId={student.id}
          coaches={coaches ?? []}
          monthlyCreditsUsed={monthlyCreditsUsed ?? 0}
          yearlyCreditsUsed={yearlyCreditsUsed ?? 0}
        />
      </div>

      <div className={styles.panel}>
        <h2>Session credits</h2>
        {credits && credits.length > 0 ? (
          <ul className={styles.list}>
            {credits.map((c) => (
              <li key={c.id} className={styles.listItem}>
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
                <p className={styles.mutedText}>
                  {creditTypeLabel(c.type)}
                  {c.reason ? ` - ${c.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.mutedText}>None available.</p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Homework notes</h2>
        <NotesPanel studentId={student.id} canAdd dark />
      </div>

      <div className={styles.panel}>
        <h2>Chat</h2>
        {user ? (
          <ChatPanel studentId={student.id} currentProfileId={user.id} dark />
        ) : (
          <p className={styles.mutedText}>Chat unavailable.</p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Exercises</h2>
        <AssignExercisePanel
          studentId={student.id}
          exercises={exerciseCatalog.data ?? []}
          assignedExerciseIds={assignedExercises.map((ex) => ex.exerciseId).filter((id): id is string => !!id)}
        />
        {assignedExercises.length > 0 ? (
          <ul className={styles.list} style={{ marginTop: 14 }}>
            {assignedExercises.map((ex) => (
              <li key={ex.id} className={styles.listItem}>
                <p>{ex.title}</p>
                {ex.audioUrl && (
                  <div style={{ marginTop: 6 }}>
                    <ExercisePlayer src={ex.audioUrl} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.mutedText} style={{ marginTop: 10 }}>
            Nothing assigned yet.
          </p>
        )}
      </div>

      <div className={styles.panel}>
        <h2>Shared folder</h2>
        {student.drive_folder_id ? (
          <SharedFolderPanel studentId={student.id} initialFiles={recordings} />
        ) : (
          <p className={styles.mutedText}>No shared folder yet for this student.</p>
        )}
      </div>
    </main>
  );
}
