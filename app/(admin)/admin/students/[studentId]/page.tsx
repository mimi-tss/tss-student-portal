import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAssignedExercises } from "@/lib/exercises";
import { getStudentUpcomingGroupLessons } from "@/lib/group-lessons";
import { formatTenure, formatPlainDate } from "@/lib/format-date";
import { renewalInfo } from "@/lib/billing/renewal";
import { FormattedDateTime } from "@/components/formatted-time";
import NotesPanel from "@/components/notes-panel";
import ChatPanel from "@/components/chat-panel";
import SharedFolderPanel from "@/components/shared-folder-panel";
import AssignExercisePanel from "@/components/assign-exercise-panel";
import AssignedExercisesList from "@/components/assigned-exercises-list";
import AdminCancelButtons from "./admin-cancel-buttons";
import RecurringScheduleClient from "./recurring-schedule-client";
import AdminUpcomingSessions from "./admin-upcoming-sessions";
import ReassignSessionCoach from "./reassign-session-coach";
import StudentHeaderActions from "./student-header-actions";
import SubscriptionLifecycleClient from "./subscription-lifecycle-client";
import StaffNotesClient from "./staff-notes-client";
import StudentAttentionItems from "./student-attention-items";
import AddCreditClient from "../../dashboard/add-credit-client";
import SessionCreditsList from "./session-credits-list";
import styles from "../../../admin.module.css";

const TIER_LABEL: Record<string, string> = { lite: "Lite", suite: "Suite", pro: "Pro", elite: "Elite" };

function formatAddress(a: {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}): string | null {
  const cityStateZip = [a.city, a.state, a.zip].filter(Boolean).join(", ");
  const parts = [a.street, cityStateZip, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatGuardian(g: {
  name: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
}): string | null {
  if (!g.name) return null;
  const parts = [g.name, g.relationship].filter(Boolean).join(" — ");
  const contact = [g.phone, g.email].filter(Boolean).join(" · ");
  return contact ? `${parts} (${contact})` : parts;
}

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
      "id, name, email, tier, subscription_status, drive_folder_id, assigned_coach_id, session_duration_minutes, birth_date, coach_start_date_override, paused_start, paused_end, created_at, billing_anniversary_date, referred_by_coach_id, ambassador, student_since_override, phone, gender, address_street, address_city, address_state, address_zip, address_country, guardian_name, guardian_relationship, guardian_phone, guardian_email, archived",
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
    { data: recurringSchedules },
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
      .select("id, day_of_week, start_time, duration_minutes, start_date, coach_id, cadence")
      .eq("student_id", student.id)
      .order("day_of_week"),
    supabase.from("coaches").select("id, name, timezone").eq("active", true).order("name"),
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

  const [exerciseCatalog, assignedExercises, upcomingGroupLessons, cancelRequestExtras] = await Promise.all([
    supabase.from("exercises").select("id, title").eq("active", true).order("title"),
    listAssignedExercises(supabase, student.id),
    getStudentUpcomingGroupLessons(supabase, student.id),
    cancelRequestRow
      ? Promise.all([
          // Not filtered to needs_action/in_progress — once "Mark
          // retained"/"Mark cancelled" has been clicked once, this row
          // is already "resolved", but the Stop panel still needs its id
          // to let admin correct/reverse that decision (e.g. retain a
          // student after mistakenly confirming their cancellation).
          // Filtering it out here left attentionItemId permanently null
          // once resolved once, disabling both buttons for good.
          supabase
            .from("attention_items")
            .select("id")
            .eq("request_id", cancelRequestRow.id)
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

  // "Next session" here previously only ever looked at 1:1 `sessions`
  // rows — a group-lesson registration (bootcamp, etc.) never showed up
  // at all, even though it's a real upcoming commitment, because it
  // lives in a separate table (group_lesson_registrations) this page
  // never queried. Mirrors the same merge the student's own dashboard
  // already does (getStudentUpcomingGroupLessons + groupLessonIsNext) —
  // this admin view is supposed to be a read-only mirror of what the
  // student actually sees, so it should show the same thing.
  const nextGroupLesson = upcomingGroupLessons[0] ?? null;
  const groupLessonIsNext =
    nextGroupLesson !== null &&
    (!nextSession || new Date(nextGroupLesson.scheduledAt).getTime() < new Date(nextSession.scheduled_at).getTime());

  return (
    <main className={styles.wrap}>
      <Link href="/admin/dashboard" className={styles.backLink}>
        ← Back to students
      </Link>

      <div style={{ marginBottom: 16 }}>
        <StudentHeaderActions
          studentId={student.id}
          name={student.name}
          archived={student.archived}
          coaches={coaches ?? []}
          initial={{
            name: student.name,
            email: student.email,
            phone: student.phone,
            gender: student.gender,
            addressStreet: student.address_street,
            addressCity: student.address_city,
            addressState: student.address_state,
            addressZip: student.address_zip,
            addressCountry: student.address_country,
            guardianName: student.guardian_name,
            guardianRelationship: student.guardian_relationship,
            guardianPhone: student.guardian_phone,
            guardianEmail: student.guardian_email,
            tier: student.tier,
            cadence: recurringSchedules?.[0]?.cadence ?? "weekly",
            ambassador: student.ambassador,
            referredByCoachId: student.referred_by_coach_id,
            birthDate: student.birth_date,
            coachStartDateOverride: student.coach_start_date_override,
            derivedCoachStartValue: firstSessionWithCoach?.scheduled_at?.slice(0, 10) ?? null,
            studentSinceOverride: student.student_since_override,
            createdAt: student.created_at,
            billingAnniversaryDate: student.billing_anniversary_date,
          }}
        />
      </div>

      <div className={styles.overviewGrid} style={{ marginTop: 0, marginBottom: 20 }}>
        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Email</div>
            <div className={styles.statValue}>{student.email}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Phone</div>
            <div className={styles.statValue}>{student.phone || <span className={styles.mutedText}>not set</span>}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Gender</div>
            <div className={styles.statValue}>{student.gender || <span className={styles.mutedText}>not set</span>}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Address</div>
            <div className={styles.statValue}>
              {formatAddress({
                street: student.address_street,
                city: student.address_city,
                state: student.address_state,
                zip: student.address_zip,
                country: student.address_country,
              }) ?? <span className={styles.mutedText}>not set</span>}
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Guardian (if minor)</div>
            <div className={styles.statValue}>
              {formatGuardian({
                name: student.guardian_name,
                relationship: student.guardian_relationship,
                phone: student.guardian_phone,
                email: student.guardian_email,
              }) ?? <span className={styles.mutedText}>not set</span>}
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Membership</div>
            <div className={styles.statValue}>
              <span className={styles.badge}>
                {TIER_LABEL[student.tier] ?? student.tier}
                {(recurringSchedules?.[0]?.cadence ?? "weekly") === "biweekly" ? " (Biweekly)" : ""}
              </span>
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Coach</div>
            <div className={styles.statValue}>{coach?.name ?? "Not yet assigned"}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Ambassador</div>
            <div className={styles.statValue}>{student.ambassador ? "Yes" : "No"}</div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Referred by</div>
            <div className={styles.statValue}>
              {coaches?.find((c) => c.id === student.referred_by_coach_id)?.name ?? (
                <span className={styles.mutedText}>Not referred</span>
              )}
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Birthday</div>
            <div className={styles.statValue}>
              {student.birth_date ? formatPlainDate(student.birth_date) : <span className={styles.mutedText}>not set</span>}
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>With coach since</div>
            <div className={styles.statValue}>
              {student.coach_start_date_override ? (
                `${formatPlainDate(student.coach_start_date_override)} (admin-set)`
              ) : firstSessionWithCoach?.scheduled_at ? (
                `${formatPlainDate(firstSessionWithCoach.scheduled_at.slice(0, 10))} (auto — first session)`
              ) : (
                <span className={styles.mutedText}>not set</span>
              )}
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>With us</div>
            <div className={styles.statValue}>
              {formatTenure(student.student_since_override ?? student.created_at)}{" "}
              {student.student_since_override ? "(admin-set)" : "(auto — account created)"}
            </div>
          </div>
          <div className={styles.statRow}>
            <div className={styles.statKey}>Billing cycle anchor</div>
            <div className={styles.statValue}>
              {student.billing_anniversary_date ? (
                formatPlainDate(student.billing_anniversary_date)
              ) : (
                <span className={styles.mutedText}>not set</span>
              )}
            </div>
          </div>

          <SubscriptionLifecycleClient
            studentId={student.id}
            subscriptionStatus={student.subscription_status}
            hasCoach={!!student.assigned_coach_id}
            hasRecurringSchedule={(recurringSchedules?.length ?? 0) > 0}
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

      <StudentAttentionItems studentId={student.id} />

      <div className={styles.panel}>
        <h2>Weekly schedule</h2>
        <RecurringScheduleClient
          studentId={student.id}
          hasCoach={!!student.assigned_coach_id}
          defaultCoachId={student.assigned_coach_id}
          coaches={coaches ?? []}
          hideStartPrompt={student.subscription_status === "active"}
          schedules={(recurringSchedules ?? []).map((s) => ({
            id: s.id,
            dayOfWeek: s.day_of_week,
            startTime: s.start_time,
            durationMinutes: s.duration_minutes,
            startDate: s.start_date,
            coachId: s.coach_id,
            cadence: s.cadence ?? "weekly",
          }))}
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Next session</h2>
          <Link href={`/admin/students/${student.id}/book`} className={styles.linkBtn}>
            Book a session
          </Link>
        </div>
        {groupLessonIsNext ? (
          <>
            <p>
              {nextGroupLesson!.topic || "Group Lesson"} — <FormattedDateTime value={nextGroupLesson!.scheduledAt} />
            </p>
            <p className={styles.mutedText} style={{ marginTop: 4 }}>
              with Coach {nextGroupLesson!.coachName} · {nextGroupLesson!.durationMinutes} min · manage via{" "}
              <Link href="/admin/group-lessons" className={styles.linkBtn}>
                Group Lessons
              </Link>
            </p>
          </>
        ) : nextSession ? (
          <>
            <p>
              <FormattedDateTime value={nextSession.scheduled_at} /> · {nextSession.duration_minutes} min
            </p>
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12 }}>
              <AdminCancelButtons
                key={nextSession.id}
                studentId={student.id}
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
        <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Session credits</h2>
          <AddCreditClient studentId={student.id} />
        </div>
        <SessionCreditsList
          studentId={student.id}
          credits={credits ?? []}
          defaultDurationMinutes={student.session_duration_minutes ?? 30}
        />
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
        <AssignedExercisesList assignedExercises={assignedExercises} />
      </div>

      <div className={styles.panel}>
        <h2>Shared folder</h2>
        {student.drive_folder_id ? (
          <SharedFolderPanel studentId={student.id} />
        ) : (
          <p className={styles.mutedText}>No shared folder yet for this student.</p>
        )}
      </div>
    </main>
  );
}
