import { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { ensureStudentDriveFolder } from "@/lib/google/drive";
import { issueAndSendLoginLink } from "@/lib/auth/magic-link";
import { materializeRecurringSessions, slotFitsWorkingHours } from "@/lib/scheduling/recurring";

export interface ProvisionStudentInput {
  email: string;
  name: string;
  tier: string;
  coachId?: string | null;
  sessionDurationMinutes?: number;
  ambassador?: boolean;
  // Overrides for students migrated in with real history predating this
  // row (CSV bulk import's main use case) — birth_date and
  // student_since_override are plain passthroughs; billingAnniversaryDate
  // overrides the otherwise-default-to-today anchor set below, since a
  // migrated student's real billing cycle rarely starts on the day their
  // row happens to get created here.
  birthDate?: string;
  billingAnniversaryDate?: string;
  studentSinceOverride?: string;
  // Also a plain passthrough, but worth calling out separately: without
  // this, a migrated student's "with coach since" auto-derives from
  // their first session materialized IN THIS APP (lib/coach/dashboard-
  // data.ts) — i.e. right after import — making a years-long coach
  // relationship from the old system look brand new.
  coachStartDateOverride?: string;
  // Optional one-go lesson setup for the "Add ambassador / manual
  // student" form, so admin doesn't have to open the new student's
  // profile separately to set their weekly/biweekly schedule or grant a
  // 4-pack. Left undefined (the CSV bulk-import route's case), none of
  // this runs — same behavior as before this existed.
  lessonType?: "weekly" | "biweekly" | "4pack";
  dayOfWeek?: number;
  startTime?: string;
  startDate?: string;
  creditExpiresAt?: string;
}

export type ProvisionStudentResult =
  | { success: true; studentId: string }
  | { success: false; error: string };

// Shared by the single-student "Add ambassador / manual student" route
// (app/api/admin/provision-student/route.ts) and the CSV bulk-import route
// — same sequence either way: insert the student row, create the auth
// user/profile, link them, grant the trial-lesson entitlement for Suite,
// provision the Drive folder (no-ops without a coach), send the login
// link. Callers are responsible for their own admin-auth check and for
// passing a service-role client — creating a Supabase auth user isn't
// something a regular session's RLS grants can do.
export async function provisionStudent(
  admin: SupabaseClient,
  input: ProvisionStudentInput,
): Promise<ProvisionStudentResult> {
  const { email, name, tier, coachId, sessionDurationMinutes, ambassador, lessonType } = input;
  const durationMinutes = sessionDurationMinutes === 60 ? 60 : 30;

  // Validated up front, before the student row exists, so a foreseeable
  // input mistake (no coach picked, no expiry set) never leaves a
  // half-provisioned student behind — same "fail before creating"
  // posture as /api/admin/recurring-schedule's own working-hours check.
  if (lessonType === "weekly" || lessonType === "biweekly") {
    if (!coachId) {
      return { success: false, error: "assign a coach to set a weekly/biweekly schedule" };
    }
    if (input.dayOfWeek === undefined || input.dayOfWeek === null || !input.startTime) {
      return { success: false, error: "day of week and start time required for a recurring schedule" };
    }
    const { data: coach } = await admin.from("coaches").select("working_hours").eq("id", coachId).single();
    if (!slotFitsWorkingHours(coach?.working_hours ?? {}, input.dayOfWeek, input.startTime, durationMinutes)) {
      return { success: false, error: "that time falls outside the coach's working hours" };
    }
  } else if (lessonType === "4pack" && !input.creditExpiresAt) {
    return { success: false, error: "an expiry date is required to grant a 4-pack" };
  }

  const { data: student, error } = await admin
    .from("students")
    .insert({
      email,
      name,
      tier,
      assigned_coach_id: coachId || null,
      subscription_status: "active",
      payment_status: "ok",
      session_duration_minutes: durationMinutes,
      billing_anniversary_date: input.billingAnniversaryDate || new Date().toISOString().slice(0, 10),
      ambassador: !!ambassador,
      birth_date: input.birthDate || null,
      student_since_override: input.studentSinceOverride || null,
      coach_start_date_override: input.coachStartDateOverride || null,
    })
    .select("id")
    .single();

  if (error || !student) {
    return { success: false, error: error?.message ?? "insert failed" };
  }

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!createErr && authUser.user) {
    await admin.from("profiles").insert({ id: authUser.user.id, role: "student" });
    await admin.from("students").update({ profile_id: authUser.user.id }).eq("id", student.id);
  }

  if (tier === "suite") {
    await admin.from("entitlements").insert({
      student_id: student.id,
      perk_type: "trial_lesson",
      recurrence: "one-time",
    });
  }

  if (lessonType === "weekly" || lessonType === "biweekly") {
    const { error: scheduleError } = await admin.from("recurring_schedules").insert({
      student_id: student.id,
      coach_id: coachId,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      duration_minutes: durationMinutes,
      start_date: input.startDate || new Date().toISOString().slice(0, 10),
      cadence: lessonType,
      active: true,
    });
    // Same posture as the drive folder / login link below: the student
    // itself is real and already created, so a secondary failure here
    // logs rather than undoing it — admin can still set the schedule by
    // hand from the student's own page afterward.
    if (scheduleError) {
      console.error(`recurring_schedules insert failed for student ${student.id}`, scheduleError);
    } else {
      await materializeRecurringSessions(admin, { studentId: student.id });
    }
  } else if (lessonType === "4pack") {
    const creditRows = Array.from({ length: 4 }, () => ({
      student_id: student.id,
      type: "purchased-addon" as const,
      expires_at: input.creditExpiresAt,
      duration_minutes: durationMinutes,
    }));
    const { error: creditError } = await admin.from("makeup_credits").insert(creditRows);
    if (creditError) {
      console.error(`4-pack credit insert failed for student ${student.id}`, creditError);
    }
  }

  // Both of these are their own external network round-trip (Google
  // Drive, then Supabase Auth + Resend) and neither's result is used by
  // this function's return value or any caller — awaiting them here was
  // real, measured latency on "Add student"/each CSV row for no benefit
  // to the response. Deferred via waitUntil (@vercel/functions) so they
  // still run to completion instead of Vercel freezing the function the
  // instant the caller's response goes out.
  waitUntil(
    (async () => {
      await ensureStudentDriveFolder(student.id);

      try {
        await issueAndSendLoginLink(student.id, email);
      } catch (err) {
        // Same posture as before: don't undo a real, already-created
        // student over an email hiccup — the login link can be resent
        // later. Matters more here than for the single-add route since a
        // bulk import shouldn't let one flaky send fail the row.
        console.error(`issueAndSendLoginLink failed for student ${student.id}`, err);
      }
    })(),
  );

  return { success: true, studentId: student.id };
}
