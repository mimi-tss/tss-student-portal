import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { parseCsvWithHeader } from "@/lib/admin/parse-csv";
import { provisionStudent, backfillStudentContactInfo } from "@/lib/admin/provision-student";
import { createRecurringSchedule } from "@/lib/admin/create-recurring-schedule";
import { DAY_NAMES } from "@/lib/scheduling/recurring";

// Serverless functions on this project's plan default to a short timeout;
// each row here does a DB insert, a Supabase Admin auth-user creation, a
// Drive API call, and an email send, so a batch of any real size needs
// more runway than the default.
export const maxDuration = 300;

const VALID_TIERS = ["lite", "suite", "pro", "elite"];
const VALID_DURATIONS = [30, 60];
const VALID_FREQUENCIES = ["weekly", "biweekly"];
const CONCURRENCY = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NewStudentRow {
  kind: "new";
  row: number;
  name: string;
  email: string;
  tier: string;
  sessionDurationMinutes: number;
  coachId: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  frequency: "weekly" | "biweekly";
  ambassador: boolean;
  birthDate: string | null;
  billingStartDate: string | null;
  studentSince: string | null;
  coachSince: string | null;
  contactInfo: ContactInfoFields;
  usedGuardianEmailAsLogin: boolean;
}

interface ExistingStudentRow {
  kind: "existing";
  row: number;
  email: string;
  studentId: string;
  contactInfo: ContactInfoFields;
}

interface ContactInfoFields {
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

type ParsedRow = NewStudentRow | ExistingStudentRow;

function parseDayOfWeek(value: string): number | null {
  if (value === "") return null;
  if (/^[0-6]$/.test(value)) return Number(value);
  const idx = DAY_NAMES.findIndex((d) => d.toLowerCase().startsWith(value.toLowerCase()));
  return idx === -1 ? null : idx;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseBoolean(value: string): boolean {
  return ["yes", "true", "1"].includes(value.toLowerCase());
}

function parseContactInfo(raw: Record<string, string>): ContactInfoFields {
  const trimmedOrUndefined = (v?: string) => (v?.trim() ? v.trim() : undefined);
  return {
    phone: trimmedOrUndefined(raw.phone),
    gender: trimmedOrUndefined(raw.gender),
    addressStreet: trimmedOrUndefined(raw.address_street),
    addressCity: trimmedOrUndefined(raw.address_city),
    addressState: trimmedOrUndefined(raw.address_state),
    addressZip: trimmedOrUndefined(raw.address_zip),
    addressCountry: trimmedOrUndefined(raw.address_country),
    guardianName: trimmedOrUndefined(raw.guardian_name),
    guardianRelationship: trimmedOrUndefined(raw.guardian_relationship),
    guardianPhone: trimmedOrUndefined(raw.guardian_phone),
    guardianEmail: trimmedOrUndefined(raw.guardian_email),
  };
}

// Admin-only bulk creation of students (+ optional recurring schedule)
// from an uploaded CSV — the batch counterpart to the single-student
// "Add ambassador / manual student" form, for onboarding many real
// students at once, AND (since the migration from the old system
// surfaced students who already exist here) backfilling contact/
// guardian info onto already-active students in the same upload. See
// app/(admin)/admin/dashboard/import-students-client.tsx for the full
// column list.
//
// Two-phase, same as before: every row is validated up front (no
// writes) and if ANY row fails, nothing is created/updated — cheap to
// fix the whole sheet and re-upload. The validation itself now
// branches on whether the row's email matches an existing student:
//
//   - New row (email not found): full validation, unchanged from
//     before — name/tier/duration/coach/schedule/etc. all required as
//     before, now also carrying the new contact/guardian columns
//     through to provisionStudent.
//   - Existing row (email matches a real student): tier/coach/
//     schedule/session-duration/ambassador/birth_date/etc. are NOT
//     validated or touched at all — this path only ever backfills
//     phone/gender/address/guardian fields, and only where the
//     student's existing value is currently blank (never overwrites
//     something already entered through the admin UI). This is what
//     lets the same CSV serve both "onboard new students" and
//     "backfill everyone we're migrating in" without the admin having
//     to blank out unrelated columns for rows that are just backfills.
//
// A row with no `email` of its own (common for younger students — only
// a parent's email is on file) falls back to `guardian_email` as the
// login/`students.email` address rather than being rejected outright;
// only a row with neither is a hard error. `guardian_email` is still
// also stored on its own column regardless, so this only affects which
// address the student logs in with. Two siblings sharing one
// guardian_email and neither having their own email would collide on
// that shared address — caught by the existing "appears more than once
// in this CSV" duplicate check, same as any other repeated email.
//
// Creation/update proceeds per-row after validation passes and does
// NOT abort on a single row's failure (a Drive-API hiccup or transient
// auth error on row 23 of 50 shouldn't discard 22 already-good rows,
// and Supabase gives no real cross-row transaction here anyway) — the
// response reports created/updated/failed per row instead.
export async function POST(req: NextRequest) {
  const { csv } = await req.json();

  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: "csv text required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const rawRows = parseCsvWithHeader(csv);
  if (rawRows.length === 0) {
    return NextResponse.json({ error: "no data rows found in CSV" }, { status: 400 });
  }

  const { data: activeCoaches } = await admin
    .from("coaches")
    .select("id, name, email")
    .eq("active", true);

  const { data: existingStudents } = await admin.from("students").select("id, email");
  const existingByEmail = new Map((existingStudents ?? []).map((s) => [s.email.toLowerCase(), s.id]));

  const validationErrors: { row: number; error: string }[] = [];
  const parsedRows: ParsedRow[] = [];
  const seenEmails = new Set<string>();

  rawRows.forEach((raw, i) => {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const contactInfo = parseContactInfo(raw);

    // A student with no email of their own (common for younger kids —
    // only a parent's email is on file) logs in as their guardian
    // instead of not being importable at all. guardian_email is still
    // stored separately on the student's own guardian_email column
    // either way (parseContactInfo above), so this only affects which
    // address becomes the login/`students.email` column.
    const ownEmail = (raw.email ?? "").trim().toLowerCase();
    const usedGuardianEmailAsLogin = !ownEmail && !!contactInfo.guardianEmail;
    const email = ownEmail || (contactInfo.guardianEmail ?? "").toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      validationErrors.push({
        row: rowNum,
        error: ownEmail
          ? `invalid email "${raw.email ?? ""}"`
          : `no email and no guardian_email to fall back to — at least one is required`,
      });
      return;
    }
    if (seenEmails.has(email)) {
      validationErrors.push({ row: rowNum, error: `email "${email}" appears more than once in this CSV` });
      return;
    }
    seenEmails.add(email);

    if (contactInfo.guardianEmail && !EMAIL_RE.test(contactInfo.guardianEmail)) {
      validationErrors.push({ row: rowNum, error: `guardian_email "${contactInfo.guardianEmail}" is not a valid email` });
    }

    const existingStudentId = existingByEmail.get(email);
    if (existingStudentId) {
      // Backfill-only path — no other column on this row is touched.
      parsedRows.push({ kind: "existing", row: rowNum, email, studentId: existingStudentId, contactInfo });
      return;
    }

    const name = raw.name ?? "";
    const tier = (raw.tier ?? "").toLowerCase();
    const durationRaw = raw.session_duration_minutes?.trim();
    const sessionDurationMinutes = durationRaw ? Number(durationRaw) : 30;
    const coachRaw = raw.coach?.trim() ?? "";
    const dayRaw = raw.day_of_week?.trim() ?? "";
    const timeRaw = raw.start_time?.trim() ?? "";
    // "bi-weekly" (hyphenated) is the natural way most people write this,
    // so it's accepted as an alias for "biweekly" rather than rejected —
    // strip whitespace/hyphens before comparing, keep the original raw
    // value for any error message below.
    const frequencyRaw = (raw.frequency?.trim() || "weekly").toLowerCase().replace(/[\s-]+/g, "");
    const ambassador = parseBoolean(raw.ambassador?.trim() ?? "");
    const birthDateRaw = raw.birth_date?.trim() ?? "";
    const billingStartDateRaw = raw.billing_start_date?.trim() ?? "";
    const studentSinceRaw = raw.student_since?.trim() ?? "";
    const coachSinceRaw = raw.coach_since?.trim() ?? "";

    if (!name) {
      validationErrors.push({ row: rowNum, error: "name is required" });
    }
    if (!VALID_TIERS.includes(tier)) {
      validationErrors.push({ row: rowNum, error: `tier must be one of ${VALID_TIERS.join("/")}, got "${raw.tier ?? ""}"` });
    }
    if (!VALID_DURATIONS.includes(sessionDurationMinutes)) {
      validationErrors.push({ row: rowNum, error: `session_duration_minutes must be 30 or 60` });
    }
    if (!VALID_FREQUENCIES.includes(frequencyRaw)) {
      validationErrors.push({ row: rowNum, error: `frequency must be weekly or biweekly, got "${raw.frequency ?? ""}"` });
    }

    let coachId: string | null = null;
    if (coachRaw) {
      const byEmail = (activeCoaches ?? []).filter(
        (c) => c.email?.toLowerCase() === coachRaw.toLowerCase(),
      );
      const matches = byEmail.length > 0
        ? byEmail
        : (activeCoaches ?? []).filter((c) => c.name.toLowerCase() === coachRaw.toLowerCase());

      if (matches.length === 0) {
        validationErrors.push({
          row: rowNum,
          error: `coach "${coachRaw}" not found (use their email, or check spelling of their name)`,
        });
      } else if (matches.length > 1) {
        validationErrors.push({
          row: rowNum,
          error: `coach name "${coachRaw}" is ambiguous (${matches.length} active coaches match) — use their email instead`,
        });
      } else {
        coachId = matches[0].id;
      }
    }

    const dayOfWeek = dayRaw ? parseDayOfWeek(dayRaw) : null;
    if (dayRaw && dayOfWeek === null) {
      validationErrors.push({ row: rowNum, error: `day_of_week "${dayRaw}" not recognized` });
    }
    if (timeRaw && !/^\d{1,2}:\d{2}$/.test(timeRaw)) {
      validationErrors.push({ row: rowNum, error: `start_time "${timeRaw}" must be HH:MM` });
    }
    if ((dayRaw && !timeRaw) || (!dayRaw && timeRaw)) {
      validationErrors.push({ row: rowNum, error: "day_of_week and start_time must both be set, or both left blank" });
    }
    if (dayRaw && timeRaw && !coachId) {
      validationErrors.push({ row: rowNum, error: "a recurring schedule requires a coach — set the coach column" });
    }

    if (birthDateRaw && !DATE_RE.test(birthDateRaw)) {
      validationErrors.push({ row: rowNum, error: `birth_date "${birthDateRaw}" must be YYYY-MM-DD` });
    }
    if (billingStartDateRaw && !DATE_RE.test(billingStartDateRaw)) {
      validationErrors.push({ row: rowNum, error: `billing_start_date "${billingStartDateRaw}" must be YYYY-MM-DD` });
    }
    if (studentSinceRaw && !DATE_RE.test(studentSinceRaw)) {
      validationErrors.push({ row: rowNum, error: `student_since "${studentSinceRaw}" must be YYYY-MM-DD` });
    }
    if (coachSinceRaw && !DATE_RE.test(coachSinceRaw)) {
      validationErrors.push({ row: rowNum, error: `coach_since "${coachSinceRaw}" must be YYYY-MM-DD` });
    }
    if (coachSinceRaw && !coachRaw) {
      validationErrors.push({ row: rowNum, error: "coach_since requires a coach — set the coach column" });
    }

    parsedRows.push({
      kind: "new",
      row: rowNum,
      name,
      email,
      tier,
      sessionDurationMinutes,
      coachId,
      dayOfWeek,
      startTime: timeRaw || null,
      frequency: frequencyRaw === "biweekly" ? "biweekly" : "weekly",
      ambassador,
      birthDate: birthDateRaw || null,
      billingStartDate: billingStartDateRaw || null,
      usedGuardianEmailAsLogin,
      studentSince: studentSinceRaw || null,
      coachSince: coachSinceRaw || null,
      contactInfo,
    });
  });

  if (validationErrors.length > 0) {
    return NextResponse.json({ validationErrors }, { status: 400 });
  }

  const results: {
    row: number;
    email: string;
    status: "created" | "updated" | "failed";
    error?: string;
    warning?: string;
  }[] = [];

  for (let i = 0; i < parsedRows.length; i += CONCURRENCY) {
    const batch = parsedRows.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (parsed) => {
        if (parsed.kind === "existing") {
          const backfillResult = await backfillStudentContactInfo(admin, parsed.studentId, parsed.contactInfo);
          if (backfillResult.error) {
            return { row: parsed.row, email: parsed.email, status: "failed" as const, error: backfillResult.error };
          }
          return { row: parsed.row, email: parsed.email, status: "updated" as const };
        }

        const provisionResult = await provisionStudent(admin, {
          email: parsed.email,
          name: parsed.name,
          tier: parsed.tier,
          coachId: parsed.coachId,
          sessionDurationMinutes: parsed.sessionDurationMinutes,
          ambassador: parsed.ambassador,
          birthDate: parsed.birthDate ?? undefined,
          billingAnniversaryDate: parsed.billingStartDate ?? undefined,
          studentSinceOverride: parsed.studentSince ?? undefined,
          coachStartDateOverride: parsed.coachSince ?? undefined,
          ...parsed.contactInfo,
        });

        if (!provisionResult.success) {
          return { row: parsed.row, email: parsed.email, status: "failed" as const, error: provisionResult.error };
        }

        if (parsed.dayOfWeek !== null && parsed.startTime) {
          const scheduleResult = await createRecurringSchedule(admin, {
            studentId: provisionResult.studentId,
            dayOfWeek: parsed.dayOfWeek,
            startTime: parsed.startTime,
            durationMinutes: parsed.sessionDurationMinutes,
            coachId: parsed.coachId,
            cadence: parsed.frequency,
          });

          if (!scheduleResult.success) {
            return {
              row: parsed.row,
              email: parsed.email,
              status: "failed" as const,
              error: `student created but schedule failed: ${scheduleResult.error}`,
            };
          }

          if (scheduleResult.warning || parsed.usedGuardianEmailAsLogin) {
            return {
              row: parsed.row,
              email: parsed.email,
              status: "created" as const,
              warning: [
                parsed.usedGuardianEmailAsLogin ? "no email on file — logs in as their guardian" : null,
                scheduleResult.warning,
              ]
                .filter(Boolean)
                .join("; "),
            };
          }
        }

        if (parsed.usedGuardianEmailAsLogin) {
          return {
            row: parsed.row,
            email: parsed.email,
            status: "created" as const,
            warning: "no email on file — logs in as their guardian",
          };
        }

        return { row: parsed.row, email: parsed.email, status: "created" as const };
      }),
    );
    results.push(...batchResults);
  }

  return NextResponse.json({ results });
}
