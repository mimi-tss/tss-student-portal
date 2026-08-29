import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { parseCsvWithHeader } from "@/lib/admin/parse-csv";
import { provisionStudent } from "@/lib/admin/provision-student";
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

interface ParsedRow {
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
}

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

// Admin-only bulk creation of students (+ optional recurring schedule)
// from an uploaded CSV — the batch counterpart to the single-student
// "Add ambassador / manual student" form, for onboarding many real
// students at once. Column schema: name, email, tier,
// session_duration_minutes, coach, day_of_week, start_time, frequency,
// ambassador, birth_date, billing_start_date, student_since, coach_since
// (see app/(admin)/admin/dashboard/import-students-client.tsx for the
// admin-facing description of each column).
//
// Two-phase: every row is validated up front (no writes) and if ANY row
// fails, nothing is created — cheap to fix the whole sheet and re-upload.
// Once every row passes validation, creation proceeds per-row and does
// NOT abort on a single row's failure (a Drive-API hiccup or transient
// auth error on row 23 of 50 shouldn't discard 22 already-good rows, and
// Supabase gives no real cross-row transaction here anyway) — the
// response reports created/failed per row instead. Re-uploading the same
// CSV afterward cleanly skips already-created rows at the duplicate-email
// check below.
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

  const { data: existingStudents } = await admin.from("students").select("email");
  const existingEmails = new Set((existingStudents ?? []).map((s) => s.email.toLowerCase()));

  const validationErrors: { row: number; error: string }[] = [];
  const parsedRows: ParsedRow[] = [];
  const seenEmails = new Set<string>();

  rawRows.forEach((raw, i) => {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const name = raw.name ?? "";
    const email = (raw.email ?? "").toLowerCase();
    const tier = (raw.tier ?? "").toLowerCase();
    const durationRaw = raw.session_duration_minutes?.trim();
    const sessionDurationMinutes = durationRaw ? Number(durationRaw) : 30;
    const coachRaw = raw.coach?.trim() ?? "";
    const dayRaw = raw.day_of_week?.trim() ?? "";
    const timeRaw = raw.start_time?.trim() ?? "";
    const frequencyRaw = (raw.frequency?.trim() || "weekly").toLowerCase();
    const ambassador = parseBoolean(raw.ambassador?.trim() ?? "");
    const birthDateRaw = raw.birth_date?.trim() ?? "";
    const billingStartDateRaw = raw.billing_start_date?.trim() ?? "";
    const studentSinceRaw = raw.student_since?.trim() ?? "";
    const coachSinceRaw = raw.coach_since?.trim() ?? "";

    if (!name) {
      validationErrors.push({ row: rowNum, error: "name is required" });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      validationErrors.push({ row: rowNum, error: `invalid email "${raw.email ?? ""}"` });
    } else if (existingEmails.has(email)) {
      validationErrors.push({ row: rowNum, error: `email "${email}" already belongs to an existing student` });
    } else if (seenEmails.has(email)) {
      validationErrors.push({ row: rowNum, error: `email "${email}" appears more than once in this CSV` });
    }
    seenEmails.add(email);

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
      studentSince: studentSinceRaw || null,
      coachSince: coachSinceRaw || null,
    });
  });

  if (validationErrors.length > 0) {
    return NextResponse.json({ validationErrors }, { status: 400 });
  }

  const results: { row: number; email: string; status: "created" | "failed"; error?: string }[] = [];

  for (let i = 0; i < parsedRows.length; i += CONCURRENCY) {
    const batch = parsedRows.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (parsed) => {
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
        }

        return { row: parsed.row, email: parsed.email, status: "created" as const };
      }),
    );
    results.push(...batchResults);
  }

  return NextResponse.json({ results });
}
