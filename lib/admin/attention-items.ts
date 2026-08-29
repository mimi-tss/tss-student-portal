import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AttentionKind =
  | "dnc"
  | "cancel_request"
  | "trial_unbooked"
  | "credit_expiring"
  | "upgraded_suite"
  | "upgraded_pro"
  | "upgraded_elite"
  | "coach_block_added"
  | "no_show_1"
  | "no_show_2"
  | "no_show_3"
  | "no_recurring_schedule"
  | "hold_ending_soon"
  | "inactive_10_days";

export type AttentionStatus = "needs_action" | "in_progress" | "resolved";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  status: AttentionStatus;
  studentId: string | null;
  studentName: string | null;
  coachId: string | null;
  coachName: string | null;
  summary: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const MISS_STATUSES = ["no-show", "late-forfeit", "cancelled-no-notice"];

// Shared by app/api/coach/mark-attendance (coach marks no-show) and
// app/api/booking/cancel (student's own late/no-credit self-cancel) —
// both are "the student missed a lesson" from the studio's point of
// view, so both feed the same consecutive-miss streak.
export async function flagConsecutiveMisses(supabase: SupabaseClient, studentId: string, studentName: string) {
  const { data: recent } = await supabase
    .from("sessions")
    .select("status, scheduled_at")
    .eq("student_id", studentId)
    .not("status", "eq", "scheduled")
    .order("scheduled_at", { ascending: false })
    .limit(5);

  let streak = 0;
  for (const s of recent ?? []) {
    if (MISS_STATUSES.includes(s.status)) streak++;
    else break;
  }
  if (streak < 1) return;

  const kind: AttentionKind = streak >= 3 ? "no_show_3" : streak === 2 ? "no_show_2" : "no_show_1";
  await createAttentionItem(supabase, {
    kind,
    studentId,
    summary:
      streak >= 3
        ? `${studentName} has missed ${streak} sessions in a row`
        : `${studentName} missed their session${streak > 1 ? `, ${streak} in a row` : ""}`,
  });
}

// ---- creation ----

// Event-driven kinds: called once, exactly when the triggering action
// happens (coach adds a block, attendance is marked, a request comes in,
// Kajabi sync detects a tier change or payment failure). Always inserts
// — each occurrence is its own reviewable event, e.g. a 2nd and 3rd
// consecutive no-show are each their own row, not a dedup of the 1st.
export async function createAttentionItem(
  supabase: SupabaseClient,
  input: { kind: AttentionKind; studentId?: string; coachId?: string; requestId?: string; summary: string },
) {
  await supabase.from("attention_items").insert({
    kind: input.kind,
    student_id: input.studentId ?? null,
    coach_id: input.coachId ?? null,
    request_id: input.requestId ?? null,
    summary: input.summary,
  });
}

// Condition-driven kinds: creates one only the first time this
// kind+student is ever seen, in ANY status — resolving (or moving to
// in_progress) sticks even if the underlying condition is still true,
// per 0035's own header comment. Relies on the partial unique index
// from migration 0062 (student_id, kind) scoped to just these 6 kinds;
// upsert+ignoreDuplicates makes this atomic under concurrent reads
// instead of the old check-then-insert, which had a race window that
// let concurrent page loads each create their own duplicate.
async function createIfNew(
  supabase: SupabaseClient,
  input: { kind: AttentionKind; studentId: string; summary: string },
) {
  await supabase.from("attention_items").upsert(
    { kind: input.kind, student_id: input.studentId, summary: input.summary },
    { onConflict: "student_id,kind", ignoreDuplicates: true },
  );
}

const EXPIRING_WITHIN_DAYS = 5;
const HOLD_ENDING_WITHIN_DAYS = 7;
const INACTIVE_DAYS = 10;

// Reconciles the 5 condition-driven kinds against current data. Cheap
// enough to run on every Needs Attention / Overview read (a handful of
// scoped queries, no full-table scans) rather than needing a cron job.
export async function syncComputedAttentionItems(supabase: SupabaseClient) {
  const now = new Date();
  const expiringCutoff = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * 24 * 60 * 60 * 1000);
  const holdCutoff = new Date(now.getTime() + HOLD_ENDING_WITHIN_DAYS * 24 * 60 * 60 * 1000);
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: dncStudents },
    { data: expiringCredits },
    { data: unbookedTrials },
    { data: proEliteStudents },
    { data: recurringSchedules },
    { data: holdsEndingSoon },
    { data: inactiveStudents },
  ] = await Promise.all([
    // DNC has no real "payment failed" webhook to hook (spec section 3:
    // no automated DNC-vs-cancellation detection was built, it's always
    // admin-set) — so it's condition-driven like the others, not
    // event-driven off a Kajabi trigger that doesn't exist.
    supabase.from("students").select("id, name").eq("payment_status", "dnc"),
    supabase
      .from("makeup_credits")
      .select("student_id, expires_at, students(name)")
      .eq("type", "student-fault")
      .eq("used", false)
      .not("expires_at", "is", null)
      .lte("expires_at", expiringCutoff.toISOString())
      .gte("expires_at", now.toISOString()),
    supabase
      .from("entitlements")
      .select("student_id, students(name)")
      .eq("perk_type", "trial_lesson")
      .eq("used", false),
    supabase
      .from("students")
      .select("id, name")
      .in("tier", ["pro", "elite"])
      .neq("subscription_status", "cancelled"),
    supabase.from("recurring_schedules").select("student_id"),
    supabase
      .from("students")
      .select("id, name, paused_end")
      .eq("subscription_status", "paused")
      .not("paused_end", "is", null)
      .lte("paused_end", holdCutoff.toISOString().slice(0, 10))
      .gte("paused_end", now.toISOString().slice(0, 10)),
    supabase
      .from("students")
      .select("id, name, streak_last_active_date")
      .neq("subscription_status", "cancelled")
      .or(`streak_last_active_date.is.null,streak_last_active_date.lt.${inactiveCutoff}`),
  ]);

  for (const s of dncStudents ?? []) {
    await createIfNew(supabase, {
      kind: "dnc",
      studentId: s.id,
      summary: "Payment failed or lapsed — review and confirm next step",
    });
  }

  for (const c of expiringCredits ?? []) {
    const student = c.students as unknown as { name: string } | null;
    if (!student || !c.expires_at) continue;
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(c.expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );
    await createIfNew(supabase, {
      kind: "credit_expiring",
      studentId: c.student_id,
      summary: `1 makeup credit expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    });
  }

  for (const e of unbookedTrials ?? []) {
    const student = e.students as unknown as { name: string } | null;
    if (!student) continue;
    await createIfNew(supabase, {
      kind: "trial_unbooked",
      studentId: e.student_id,
      summary: "Has an unused trial lesson not yet booked",
    });
  }

  const scheduledStudentIds = new Set((recurringSchedules ?? []).map((r) => r.student_id));
  for (const s of proEliteStudents ?? []) {
    if (scheduledStudentIds.has(s.id)) continue;
    await createIfNew(supabase, {
      kind: "no_recurring_schedule",
      studentId: s.id,
      summary: "Pro/Elite student with no weekly recurring schedule set",
    });
  }

  for (const s of holdsEndingSoon ?? []) {
    await createIfNew(supabase, {
      kind: "hold_ending_soon",
      studentId: s.id,
      summary: `Hold ends ${s.paused_end} — billing resumes at regular price`,
    });
  }

  for (const s of inactiveStudents ?? []) {
    await createIfNew(supabase, {
      kind: "inactive_10_days",
      studentId: s.id,
      summary: s.streak_last_active_date
        ? `Last active ${s.streak_last_active_date} — hasn't logged in for over ${INACTIVE_DAYS} days`
        : `Never logged in`,
    });
  }
}

// ---- reads ----

export async function getAttentionItems(
  supabase: SupabaseClient,
  status?: AttentionStatus,
): Promise<AttentionItem[]> {
  await syncComputedAttentionItems(supabase);

  let query = supabase
    .from("attention_items")
    .select("id, kind, status, student_id, coach_id, summary, admin_note, created_at, resolved_at, students(name), coaches(name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data } = await query;

  return (data ?? []).map((item) => ({
    id: item.id,
    kind: item.kind as AttentionKind,
    status: item.status as AttentionStatus,
    studentId: item.student_id,
    studentName: (item.students as unknown as { name: string } | null)?.name ?? null,
    coachId: item.coach_id,
    coachName: (item.coaches as unknown as { name: string } | null)?.name ?? null,
    summary: item.summary,
    adminNote: item.admin_note,
    createdAt: item.created_at,
    resolvedAt: item.resolved_at,
  }));
}

export async function resolveAttentionItem(
  supabase: SupabaseClient,
  id: string,
  {
    status,
    note,
    resolvedBy,
    requestOutcome = "approved",
  }: { status: AttentionStatus; note?: string; resolvedBy: string; requestOutcome?: "approved" | "denied" },
) {
  const { data: item } = await supabase
    .from("attention_items")
    .select("kind, request_id")
    .eq("id", id)
    .maybeSingle();

  await supabase
    .from("attention_items")
    .update({
      status,
      admin_note: note ?? null,
      updated_at: new Date().toISOString(),
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolved_by: status === "resolved" ? resolvedBy : null,
    })
    .eq("id", id);

  // A cancel_request item's underlying student_requests row needs its own
  // resolution too. Resolving normally means "admin has gone and
  // cancelled it in Kajabi" (approved); `requestOutcome: "denied"` is the
  // retention path — admin talked the student into staying, so the
  // request is denied instead and materializeRecurringSessions won't
  // stop generating future sessions for them.
  if (item?.kind === "cancel_request" && item.request_id && status === "resolved") {
    await supabase
      .from("student_requests")
      .update({ status: requestOutcome, resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
      .eq("id", item.request_id)
      .eq("status", "pending");
  }
}

// ---- Overview page stats (live business metrics, separate from the
// manual-work queue above — a stat card shows the real current count
// even if admin already marked a related item "resolved") ----

export interface OverviewStats {
  activeStudents: number;
  tierBreakdown: { lite: number; suite: number; pro: number; elite: number };
  unbookedTrials: number;
  dncCount: number;
  needsActionCount: number;
}

export async function getOverviewStats(supabase: SupabaseClient): Promise<OverviewStats> {
  const [{ data: students }, { data: dncStudents }, { data: unbookedTrialRows }, { count: needsActionCount }] =
    await Promise.all([
      supabase.from("students").select("id, tier").neq("subscription_status", "cancelled"),
      supabase.from("students").select("id").eq("payment_status", "dnc"),
      supabase.from("entitlements").select("student_id").eq("perk_type", "trial_lesson").eq("used", false),
      supabase.from("attention_items").select("id", { count: "exact", head: true }).eq("status", "needs_action"),
    ]);

  const tierBreakdown = { lite: 0, suite: 0, pro: 0, elite: 0 };
  for (const s of students ?? []) {
    if (s.tier in tierBreakdown) tierBreakdown[s.tier as keyof typeof tierBreakdown]++;
  }

  return {
    activeStudents: students?.length ?? 0,
    tierBreakdown,
    unbookedTrials: unbookedTrialRows?.length ?? 0,
    dncCount: dncStudents?.length ?? 0,
    needsActionCount: needsActionCount ?? 0,
  };
}
