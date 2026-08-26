import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Payroll calc/export layer, not a full payroll system (TSS_App_Spec_1.md
// section 6) — computes what's owed per coach per period from data the
// app already owns (session status, duration, actual coach); real
// disbursement happens externally (Gusto/Deel/QuickBooks) via export.

// Attended and no-show/late-forfeit/no-notice-cancel all still pay the
// coach, since the studio still charged the student in full (no-refund
// policy). A with-notice cancellation is deliberately excluded: the
// resulting makeup session is "one billable event" (spec section 6) and
// gets paid on its own, separate `sessions` row when it happens — so no
// cross-row linking is needed here, just excluding the original slot.
export const PAID_STATUSES = ["attended", "no-show", "late-forfeit", "cancelled-no-notice"] as const;

// A student tagged as referred by a coach (students.referred_by_coach_id)
// earns that coach this much extra per hour, indefinitely, whenever
// they're the one actually teaching the session — not a one-time
// bonus, and not group lessons (there's no single "the student" on a
// group roster to check against).
export const REFERRAL_BONUS_PER_HOUR = 10;

export interface PayableSession {
  id: string;
  type: "session" | "group-lesson";
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  studentId: string | null;
  studentName: string;
  amount: number;
  isReferralBonus: boolean;
}

export interface CoachPayrollSummary {
  coachId: string;
  coachName: string;
  hourlyRate: number;
  sessions: PayableSession[];
  total: number;
}

function payForSession(hourlyRate: number, durationMinutes: number): number {
  return Math.round(hourlyRate * (durationMinutes / 60) * 100) / 100;
}

async function fetchPayableSessions(
  supabase: SupabaseClient,
  coachId: string,
  periodStart: string,
  periodEnd: string,
) {
  return supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, status, student_id, students(name, referred_by_coach_id)")
    .eq("actual_coach_id", coachId)
    .in("status", PAID_STATUSES)
    .gte("scheduled_at", periodStart)
    .lt("scheduled_at", periodEnd)
    .order("scheduled_at");
}

// Group lessons pay the coach once per lesson (their teaching time),
// regardless of how many students attended — gated on the lesson
// actually having happened, not on any per-attendee marking, since
// attendance here tracks individual students, not whether the coach
// taught the class.
async function fetchPayableGroupLessons(
  supabase: SupabaseClient,
  coachId: string,
  periodStart: string,
  periodEnd: string,
) {
  const { data } = await supabase
    .from("group_lessons")
    .select("id, topic, scheduled_at, duration_minutes, group_lesson_registrations(id)")
    .eq("coach_id", coachId)
    .gte("scheduled_at", periodStart)
    .lt("scheduled_at", periodEnd)
    .order("scheduled_at");

  const now = Date.now();
  return (data ?? []).filter(
    (g) => new Date(g.scheduled_at).getTime() + g.duration_minutes * 60 * 1000 <= now,
  );
}

// One coach, on the fly — no writes. Backs the coach's own "current
// period so far" view and is the building block for the admin rollup.
export async function computeCoachPayroll(
  supabase: SupabaseClient,
  coachId: string,
  periodStart: string,
  periodEnd: string,
): Promise<CoachPayrollSummary> {
  const [{ data: coach }, { data: sessions }, groupLessons] = await Promise.all([
    supabase.from("coaches").select("id, name, hourly_rate").eq("id", coachId).single(),
    fetchPayableSessions(supabase, coachId, periodStart, periodEnd),
    fetchPayableGroupLessons(supabase, coachId, periodStart, periodEnd),
  ]);

  if (!coach) {
    throw new Error(`coach not found: ${coachId}`);
  }

  const hourlyRate = Number(coach.hourly_rate);
  const sessionsPayable: PayableSession[] = (sessions ?? []).map((s) => {
    const student = s.students as unknown as { name: string; referred_by_coach_id: string | null } | null;
    const isReferralBonus = student?.referred_by_coach_id === coachId;
    return {
      id: s.id,
      type: "session",
      scheduledAt: s.scheduled_at,
      durationMinutes: s.duration_minutes,
      status: s.status,
      studentId: s.student_id,
      studentName: student?.name ?? "Student",
      amount: payForSession(hourlyRate + (isReferralBonus ? REFERRAL_BONUS_PER_HOUR : 0), s.duration_minutes),
      isReferralBonus,
    };
  });
  const groupLessonsPayable: PayableSession[] = groupLessons.map((g) => {
    const attendeeCount = (g.group_lesson_registrations as unknown as { id: string }[] | null)?.length ?? 0;
    return {
      id: g.id,
      type: "group-lesson",
      scheduledAt: g.scheduled_at,
      durationMinutes: g.duration_minutes,
      status: "occurred",
      studentId: null,
      studentName: `${g.topic || "Group Lesson"} — ${attendeeCount} student${attendeeCount === 1 ? "" : "s"}`,
      amount: payForSession(hourlyRate, g.duration_minutes),
      isReferralBonus: false,
    };
  });
  const payable = [...sessionsPayable, ...groupLessonsPayable].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  return {
    coachId: coach.id,
    coachName: coach.name,
    hourlyRate,
    sessions: payable,
    total: Math.round(payable.reduce((sum, s) => sum + s.amount, 0) * 100) / 100,
  };
}

// All coaches, on the fly — no writes. Backs the admin rollup view.
export async function computeAllCoachesPayroll(
  supabase: SupabaseClient,
  periodStart: string,
  periodEnd: string,
): Promise<CoachPayrollSummary[]> {
  const { data: coaches } = await supabase.from("coaches").select("id").order("name");
  const summaries = await Promise.all(
    (coaches ?? []).map((c) => computeCoachPayroll(supabase, c.id, periodStart, periodEnd)),
  );
  return summaries;
}

export interface GeneratedRunCoachSummary {
  coachId: string;
  coachName: string;
  entries: number;
  total: number;
}

export interface GeneratePayrollRunResult {
  inserted: number;
  skippedAlreadyPaid: number;
  perCoach: GeneratedRunCoachSummary[];
}

// Persists real payroll_entries rows for a period (optionally scoped to
// one coach) — the frozen, exportable snapshot an admin "generates" for
// a pay run. Idempotent: relies on payroll_entries' unique(session_id)
// constraint (migration 0023) to skip sessions already paid out in an
// earlier or overlapping run, rather than duplicating them.
export async function generatePayrollRun(
  supabase: SupabaseClient,
  periodStart: string,
  periodEnd: string,
  coachId?: string,
): Promise<GeneratePayrollRunResult> {
  const summaries = coachId
    ? [await computeCoachPayroll(supabase, coachId, periodStart, periodEnd)]
    : await computeAllCoachesPayroll(supabase, periodStart, periodEnd);

  const sessionRows = summaries.flatMap((summary) =>
    summary.sessions
      .filter((s) => s.type === "session")
      .map((s) => ({
        coach_id: summary.coachId,
        session_id: s.id,
        amount: s.amount,
        period_start: periodStart,
        period_end: periodEnd,
      })),
  );
  const groupLessonRows = summaries.flatMap((summary) =>
    summary.sessions
      .filter((s) => s.type === "group-lesson")
      .map((s) => ({
        coach_id: summary.coachId,
        group_lesson_id: s.id,
        amount: s.amount,
        period_start: periodStart,
        period_end: periodEnd,
      })),
  );

  if (sessionRows.length === 0 && groupLessonRows.length === 0) {
    return { inserted: 0, skippedAlreadyPaid: 0, perCoach: [] };
  }

  const [{ data: insertedSessions, error: sessionsError }, { data: insertedGroups, error: groupsError }] =
    await Promise.all([
      sessionRows.length > 0
        ? supabase
            .from("payroll_entries")
            .upsert(sessionRows, { onConflict: "session_id", ignoreDuplicates: true })
            .select("session_id")
        : Promise.resolve({ data: [], error: null }),
      groupLessonRows.length > 0
        ? supabase
            .from("payroll_entries")
            .upsert(groupLessonRows, { onConflict: "group_lesson_id", ignoreDuplicates: true })
            .select("group_lesson_id")
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (sessionsError) throw new Error(sessionsError.message);
  if (groupsError) throw new Error(groupsError.message);

  const totalRows = sessionRows.length + groupLessonRows.length;
  const insertedCount = (insertedSessions?.length ?? 0) + (insertedGroups?.length ?? 0);

  // Per-coach breakdown of what was *actually* newly written (not rows
  // skipped because an earlier/overlapping run already covered them) —
  // upsert's ON CONFLICT DO NOTHING only returns freshly-inserted rows,
  // so cross-referencing those ids back against sessionRows/groupLessonRows
  // (which already carry coach_id + amount) gives an exact answer without
  // a second query. Backs the admin confirmation popup and, indirectly,
  // each coach's "new payroll" dashboard flag (payroll_entries.coach_seen_at
  // starts null on every freshly-inserted row).
  const insertedSessionIds = new Set((insertedSessions ?? []).map((r) => r.session_id));
  const insertedGroupLessonIds = new Set((insertedGroups ?? []).map((r) => r.group_lesson_id));
  const newRows = [
    ...sessionRows.filter((r) => insertedSessionIds.has(r.session_id)),
    ...groupLessonRows.filter((r) => insertedGroupLessonIds.has(r.group_lesson_id)),
  ];

  const coachNameById = new Map(summaries.map((s) => [s.coachId, s.coachName]));
  const perCoachMap = new Map<string, { entries: number; total: number }>();
  for (const row of newRows) {
    const existing = perCoachMap.get(row.coach_id) ?? { entries: 0, total: 0 };
    existing.entries += 1;
    existing.total = Math.round((existing.total + row.amount) * 100) / 100;
    perCoachMap.set(row.coach_id, existing);
  }
  const perCoach: GeneratedRunCoachSummary[] = Array.from(perCoachMap.entries())
    .map(([id, v]) => ({ coachId: id, coachName: coachNameById.get(id) ?? "Coach", ...v }))
    .sort((a, b) => a.coachName.localeCompare(b.coachName));

  return { inserted: insertedCount, skippedAlreadyPaid: totalRows - insertedCount, perCoach };
}

export interface UnrecordedSession {
  id: string;
  scheduledAt: string;
  studentName: string;
}

export interface CoachUnrecordedAttendance {
  coachId: string;
  coachName: string;
  sessions: UnrecordedSession[];
}

// Sessions that already happened but nobody marked attendance on — still
// sitting at the default 'scheduled' status, so computeCoachPayroll's
// PAID_STATUSES filter silently excludes them rather than erroring.
// Backs the admin Finance page's monthly pre-payroll attendance check
// (run payroll on the 1st for the prior calendar month → confirm every
// session in that range got marked before generating). Group lessons
// aren't included — they're payable on elapsed time alone, no per-
// session attendance gate (see fetchPayableGroupLessons above).
export async function findUnrecordedAttendance(
  supabase: SupabaseClient,
  periodStart: string,
  periodEnd: string,
  coachId?: string,
): Promise<CoachUnrecordedAttendance[]> {
  let query = supabase
    .from("sessions")
    .select("id, scheduled_at, actual_coach_id, coaches(name), students(name)")
    .eq("status", "scheduled")
    .gte("scheduled_at", periodStart)
    .lt("scheduled_at", periodEnd)
    .lt("scheduled_at", new Date().toISOString())
    .order("scheduled_at");

  if (coachId) query = query.eq("actual_coach_id", coachId);

  const { data } = await query;

  const byCoach = new Map<string, CoachUnrecordedAttendance>();
  for (const s of data ?? []) {
    const coach = s.coaches as unknown as { name: string } | null;
    const student = s.students as unknown as { name: string } | null;
    const existing = byCoach.get(s.actual_coach_id);
    const session: UnrecordedSession = {
      id: s.id,
      scheduledAt: s.scheduled_at,
      studentName: student?.name ?? "Student",
    };
    if (existing) {
      existing.sessions.push(session);
    } else {
      byCoach.set(s.actual_coach_id, {
        coachId: s.actual_coach_id,
        coachName: coach?.name ?? "Coach",
        sessions: [session],
      });
    }
  }

  return Array.from(byCoach.values()).sort((a, b) => a.coachName.localeCompare(b.coachName));
}
