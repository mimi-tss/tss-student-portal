import { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { ensureStudentDriveFolder } from "@/lib/google/drive";
import { issueAndSendLoginLink } from "@/lib/auth/magic-link";
import { materializeRecurringSessions, nextWeeklySlotInstant, slotFitsWorkingHours } from "@/lib/scheduling/recurring";

export interface ProvisionStudentInput {
  email: string;
  name: string;
  tier: string;
  coachId?: string | null;
  sessionDurationMinutes?: number;
  ambassador?: boolean;
  // Explicit admin choice, from the "Add ambassador / manual student"
  // form's own checkbox — overrides the old implicit "Suite tier always
  // gets one" rule below. Left undefined (the CSV bulk-import route's
  // case, which never sends this field), falls back to that same
  // tier-based default so bulk import's behavior is unchanged.
  grantTrial?: boolean;
  // Locks a granted trial to one specific coach (migration 0093 — e.g. a
  // student who paid extra for a trial with Tara specifically), instead
  // of the default any-coach-picker. Ignored unless grantTrial resolves
  // true.
  trialCoachId?: string | null;
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
  // Plain passthroughs for the same migrated-student use case — none
  // of these existed before this app captured them, so there's no
  // "override a derived value" concept here like the fields above,
  // just data to carry straight through if the CSV row has it.
  phone?: string;
  gender?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  guardianEmail?: string;
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
// user/profile, link them, grant the trial-lesson entitlement if asked
// for (or, absent an explicit grantTrial, for Suite tier by default),
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
    const { data: coach } = await admin.from("coaches").select("working_hours, timezone").eq("id", coachId).single();
    if (!slotFitsWorkingHours(coach?.working_hours ?? {}, input.dayOfWeek, input.startTime, durationMinutes)) {
      return { success: false, error: "that time falls outside the coach's working hours" };
    }

    // Same coach-double-booking checks the admin single-add route and
    // the CSV-import helper both run — this is the third of three
    // places a recurring schedule gets created, and the risk is
    // identical: nothing stopped this brand-new student's slot from
    // landing on top of a standing block or another student's existing
    // recurring lesson with the same coach.
    const nextInstant = nextWeeklySlotInstant(input.dayOfWeek, input.startTime, coach?.timezone ?? "America/New_York");
    const nextInstantEnd = new Date(nextInstant.getTime() + durationMinutes * 60000);
    const { data: conflictingBlock } = await admin
      .from("coach_blocks")
      .select("id")
      .eq("coach_id", coachId)
      .lt("start_at", nextInstantEnd.toISOString())
      .gt("end_at", nextInstant.toISOString())
      .maybeSingle();

    if (conflictingBlock) {
      return { success: false, error: "that time is blocked off on the coach's calendar (e.g. a standing meeting or break)" };
    }

    const { data: coachSchedules } = await admin
      .from("recurring_schedules")
      .select("start_time, duration_minutes, students(name)")
      .eq("coach_id", coachId)
      .eq("day_of_week", input.dayOfWeek);

    const [newHH, newMM] = input.startTime.split(":").map(Number);
    const newStartMin = newHH * 60 + newMM;
    const newEndMin = newStartMin + durationMinutes;
    const coachConflict = (coachSchedules ?? []).find((other: { start_time: string; duration_minutes: number }) => {
      const [oh, om] = other.start_time.split(":").map(Number);
      const otherStartMin = oh * 60 + om;
      const otherEndMin = otherStartMin + other.duration_minutes;
      return newStartMin < otherEndMin && newEndMin > otherStartMin;
    });

    if (coachConflict) {
      const otherStudent = coachConflict.students as unknown as { name: string } | null;
      return {
        success: false,
        error: otherStudent?.name
          ? `the coach already has ${otherStudent.name} booked at an overlapping time that day`
          : "the coach already has another student booked at an overlapping time that day",
      };
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
      phone: input.phone || null,
      gender: input.gender || null,
      address_street: input.addressStreet || null,
      address_city: input.addressCity || null,
      address_state: input.addressState || null,
      address_zip: input.addressZip || null,
      address_country: input.addressCountry || null,
      guardian_name: input.guardianName || null,
      guardian_relationship: input.guardianRelationship || null,
      guardian_phone: input.guardianPhone || null,
      guardian_email: input.guardianEmail || null,
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

  if (input.grantTrial ?? tier === "suite") {
    await admin.from("entitlements").insert({
      student_id: student.id,
      perk_type: "trial_lesson",
      recurrence: "one-time",
      coach_id: input.trialCoachId || null,
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

export interface BackfillContactInfoInput {
  phone?: string;
  gender?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  guardianEmail?: string;
}

const BACKFILL_FIELD_MAP: Record<keyof BackfillContactInfoInput, string> = {
  phone: "phone",
  gender: "gender",
  addressStreet: "address_street",
  addressCity: "address_city",
  addressState: "address_state",
  addressZip: "address_zip",
  addressCountry: "address_country",
  guardianName: "guardian_name",
  guardianRelationship: "guardian_relationship",
  guardianPhone: "guardian_phone",
  guardianEmail: "guardian_email",
};

// CSV bulk-import's "backfill" path for a row whose email matches an
// EXISTING student (see bulk-import-students/route.ts) — fills blanks
// only, never overwrites. Nothing already typed into the app through
// the normal admin UI can get silently clobbered by a re-upload of the
// same migration CSV; only genuinely-missing fields get filled in.
export async function backfillStudentContactInfo(
  admin: SupabaseClient,
  studentId: string,
  input: BackfillContactInfoInput,
): Promise<{ updated: boolean; error?: string }> {
  const columns = Object.values(BACKFILL_FIELD_MAP);
  const { data: existing, error: fetchError } = await admin
    .from("students")
    .select(columns.join(", "))
    .eq("id", studentId)
    .single();

  if (fetchError || !existing) {
    return { updated: false, error: fetchError?.message ?? "student not found" };
  }

  const existingRow = existing as unknown as Record<string, string | null>;
  const update: Record<string, string> = {};

  for (const key of Object.keys(BACKFILL_FIELD_MAP) as (keyof BackfillContactInfoInput)[]) {
    const newValue = input[key];
    const column = BACKFILL_FIELD_MAP[key];
    if (newValue && !existingRow[column]) {
      update[column] = newValue;
    }
  }

  if (Object.keys(update).length === 0) {
    return { updated: false };
  }

  const { error } = await admin.from("students").update(update).eq("id", studentId);
  if (error) {
    return { updated: false, error: error.message };
  }

  return { updated: true };
}
