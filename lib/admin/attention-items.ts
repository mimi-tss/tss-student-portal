import type { createClient } from "@/lib/supabase/server";
import { zonedYearMonthDay } from "@/lib/timezone";
import { fifthWeekOccurrence } from "@/lib/scheduling/recurring";
import { getHolidayDateKeys } from "@/lib/scheduling/holidays";

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
  | "inactive_10_days"
  | "recording_unmatched"
  | "recording_missing"
  | "fifth_week_available"
  | "group_lesson_understaffed";

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
  // Only ever set for "fifth_week_available" — the exact instant the
  // offered one-off lesson would go at, so the "Add lesson" action can
  // book it directly without re-deriving it.
  occurrenceAt: string | null;
}

const MISS_STATUSES = ["no-show", "late-forfeit", "cancelled-no-notice"];

// Shared by app/api/coach/mark-attendance (coach marks no-show) and
// app/api/booking/cancel (student's own late/no-credit self-cancel) —
// both are "the student missed a lesson" from the studio's point of
// view, so both feed the same consecutive-miss streak. sessionId is the
// specific session that triggered this call — required so the resulting
// item can dedup on it (createNoShowIfNew below): mark-attendance can
// legitimately re-mark the same session (a coach correcting a misclick),
// and without a session-scoped dedup that used to insert a brand new
// duplicate Needs Review card every single time, confirmed live as
// exactly what happened to Jazmynn Hernandez (6+ identical cards for one
// real missed lesson).
export async function flagConsecutiveMisses(
  supabase: SupabaseClient,
  studentId: string,
  studentName: string,
  sessionId: string,
) {
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
  await createNoShowIfNew(supabase, {
    kind,
    studentId,
    sessionId,
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
// from migration 0062 (student_id, kind) scoped to just these 6 kinds.
// Goes through the attention_item_upsert_condition() RPC (migration
// 0082), not a plain .upsert() — Postgres requires an ON CONFLICT
// clause's WHERE predicate to match a partial index's own predicate
// exactly, and supabase-js's onConflict option has no way to express
// that extra WHERE clause, so a direct .upsert() against this index
// always fails (confirmed live: every call errored with "no unique or
// exclusion constraint matching the ON CONFLICT specification",
// silently, since nothing here ever checked the error). The RPC does
// the exact same atomic on-conflict-do-nothing insert, just from a
// context that CAN state the matching predicate.
async function createIfNew(
  supabase: SupabaseClient,
  input: { kind: AttentionKind; studentId: string; summary: string },
) {
  await supabase.rpc("attention_item_upsert_condition", {
    p_kind: input.kind,
    p_student_id: input.studentId,
    p_summary: input.summary,
  });
}

// Session-scoped dedup for no_show_1/2/3 (migration 0089) — a re-mark of
// the SAME session (a coach correcting a misclick, see mark-attendance's
// own comment on why re-marking is allowed at all) must not create a
// second card for it. Uniqueness is on session_id alone, not
// (session_id, kind): the streak-derived kind can shift between two
// marks of the same session (an intervening session getting marked
// changes the streak count), but there's still only ever one real event
// to review here. Same RPC-not-.upsert() reasoning as createIfNew above.
async function createNoShowIfNew(
  supabase: SupabaseClient,
  input: { kind: AttentionKind; studentId: string; sessionId: string; summary: string },
) {
  await supabase.rpc("attention_item_upsert_no_show", {
    p_kind: input.kind,
    p_student_id: input.studentId,
    p_session_id: input.sessionId,
    p_summary: input.summary,
  });
}

// Called the moment a recording leaves 'unmatched' (matched or
// dismissed, see lib/admin/recording-matching.ts) — unlike the 5
// condition-driven kinds above, a recording_unmatched item's underlying
// problem has a single clean fix-it event, so resolving it here is more
// helpful than making an admin close it by hand after already fixing it
// in the Recordings queue.
// sessionId resolves the OTHER recording kind at the same time —
// recording_unmatched (keyed by recording_id) and recording_missing
// (keyed by session_id) are opposite sides of the same event, but were
// only ever wired to close on their own condition-driven sync pass.
// That pass computes recording_missing's "does a match exist now" check
// against a plain UTC todayStr floor (see syncRecordingAttentionItems)
// which incorrectly excludes a same-day match whose recorded_date lands
// on the coach's local previous calendar day (any evening EDT session,
// confirmed live) — so resolving it here, at the moment a real match
// happens, is both faster and doesn't depend on that floor being right.
export async function resolveAttentionItemsForRecording(
  supabase: SupabaseClient,
  recordingId: string,
  sessionId?: string | null,
) {
  await supabase
    .from("attention_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("recording_id", recordingId)
    .eq("kind", "recording_unmatched")
    .neq("status", "resolved");

  if (sessionId) {
    await supabase
      .from("attention_items")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("session_id", sessionId)
      .eq("kind", "recording_missing")
      .neq("status", "resolved");
  }
}

const EXPIRING_WITHIN_DAYS = 5;
const HOLD_ENDING_WITHIN_DAYS = 7;
const INACTIVE_DAYS = 10;
const RECORDING_GRACE_HOURS = 6; // matches the real multi-hour Meet processing delay confirmed live

// A no-show or forfeited session never had anyone actually attend, and a
// cancelled one never happened at all — none of these should ever be
// expected to produce a recording. Distinct from (though overlapping
// with) MISS_STATUSES above: this is "was there anything to record",
// not "did the student miss it" (a coach-side no-show, if that were ever
// tracked separately, would belong here too but not in MISS_STATUSES).
const NO_RECORDING_EXPECTED_STATUSES = ["cancelled-with-notice", "cancelled-no-notice", "no-show", "late-forfeit"];

// Reconciles the 5 condition-driven kinds against current data. Cheap
// enough to run on every Needs Attention / Overview read (a handful of
// scoped queries, no full-table scans) rather than needing a cron job.
export async function syncComputedAttentionItems(supabase: SupabaseClient) {
  const now = new Date();
  const expiringCutoff = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * 24 * 60 * 60 * 1000);
  const holdCutoff = new Date(now.getTime() + HOLD_ENDING_WITHIN_DAYS * 24 * 60 * 60 * 1000);
  const inactiveCutoffInstant = new Date(now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const inactiveCutoff = inactiveCutoffInstant.toISOString().slice(0, 10);

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
    // A student who's never logged in isn't "inactive" until they've
    // actually had time to — a just-migrated/just-added student with
    // streak_last_active_date still null shouldn't get flagged the
    // moment they exist (confirmed: a batch student migration is about
    // to add a bunch of never-logged-in-yet students all at once, which
    // would've otherwise flooded this with false positives on day one).
    // Same INACTIVE_DAYS grace period either way — just measured from
    // created_at instead of streak_last_active_date for the null case.
    supabase
      .from("students")
      .select("id, name, streak_last_active_date")
      .neq("subscription_status", "cancelled")
      .or(
        `and(streak_last_active_date.is.null,created_at.lt.${inactiveCutoffInstant.toISOString()}),streak_last_active_date.lt.${inactiveCutoff}`,
      ),
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

  await syncRecordingAttentionItems(supabase);
  await syncFifthWeekAttentionItems(supabase);
}

// Weekly-cadence Pro/Elite students only — Suite has no session cap to
// have a "5th week" against, and a biweekly schedule's own cap logic
// (monthOccurrenceNumber, unrelated to the billing cycle) never
// produces this situation at all. Forward-looking only, same posture
// as the recording kinds above: only ever the CURRENT cycle's own
// opportunity, never a backlog of cycles that already passed.
async function syncFifthWeekAttentionItems(supabase: SupabaseClient) {
  const now = new Date();

  const { data: schedules } = await supabase
    .from("recurring_schedules")
    .select(
      "student_id, coach_id, day_of_week, start_time, cadence, students(name, tier, subscription_status, billing_anniversary_date), coaches(timezone)",
    )
    .eq("active", true)
    .eq("cadence", "weekly");

  if (!schedules || schedules.length === 0) return;

  const holidayDates = await getHolidayDateKeys(supabase);

  const candidates: { studentId: string; coachId: string; studentName: string; occurrenceAt: Date }[] = [];
  for (const s of schedules) {
    const student = (
      Array.isArray(s.students) ? s.students[0] : s.students
    ) as { name: string; tier: string; subscription_status: string; billing_anniversary_date: string | null } | null;
    if (!student) continue;
    if (student.tier !== "pro" && student.tier !== "elite") continue;
    if (student.subscription_status !== "active") continue;

    const coach = (Array.isArray(s.coaches) ? s.coaches[0] : s.coaches) as { timezone: string } | null;
    const occurrenceAt = fifthWeekOccurrence(
      s.day_of_week,
      s.start_time,
      coach?.timezone ?? "America/New_York",
      now,
      student.billing_anniversary_date,
      holidayDates,
    );
    if (!occurrenceAt) continue;

    candidates.push({ studentId: s.student_id, coachId: s.coach_id, studentName: student.name, occurrenceAt });
  }

  if (candidates.length === 0) return;

  // A session might already exist at that exact instant — admin already
  // added it (via this same item's own action, on a previous pass) or
  // some other path got there first. Either way, nothing left to offer.
  const { data: existingSessions } = await supabase
    .from("sessions")
    .select("student_id, scheduled_at")
    .in("student_id", candidates.map((c) => c.studentId))
    .in("scheduled_at", candidates.map((c) => c.occurrenceAt.toISOString()));

  const taken = new Set((existingSessions ?? []).map((s) => `${s.student_id}|${s.scheduled_at}`));

  const rows = candidates
    .filter((c) => !taken.has(`${c.studentId}|${c.occurrenceAt.toISOString()}`))
    .map((c) => ({
      kind: "fifth_week_available" as const,
      student_id: c.studentId,
      coach_id: c.coachId,
      occurrence_at: c.occurrenceAt.toISOString(),
      summary: `Has an extra lesson slot open this cycle (${c.occurrenceAt.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}, same day/time as usual) — offer a one-off add-on`,
    }));

  // Per-row RPC calls (attention_item_upsert_fifth_week, migration
  // 0082), run in parallel — same reasoning as createIfNew's own
  // comment above: a plain .upsert() can't match this partial index's
  // WHERE predicate at all. Parallel keeps this close to the single
  // batched round-trip a working .upsert() would have been, rather than
  // going fully sequential.
  await Promise.all(
    rows.map((r) =>
      supabase.rpc("attention_item_upsert_fifth_week", {
        p_student_id: r.student_id,
        p_coach_id: r.coach_id,
        p_occurrence_at: r.occurrence_at,
        p_summary: r.summary,
      }),
    ),
  );
}

// Both kinds here are bounded to a short recent window
// (RECORDING_MISSING_LOOKBACK_DAYS), not the full historical backlog —
// surfacing weeks of pre-existing unmatched recordings here would
// recreate the exact "queue too overwhelming to use" problem already
// hit once building the Recordings page itself. This used to be a hard
// "today only" (UTC calendar day) floor instead of a rolling window,
// which silently dropped any session that became due yesterday and
// just hadn't been caught yet — confirmed live: Ayla Carswell's session
// the day before never got a recording_missing item at all, because by
// the time anyone next opened Needs Review (or the cron ran), "today"
// had already moved past her session's date and the query's floor moved
// with it, permanently excluding her. A session that's a day or two old
// and still missing its recording is exactly the case this feature
// exists to catch, not backlog to hide.
//
// Batched rather than one query per row — this runs on every Needs
// Review/Overview read (getAttentionItems below), so a studio with
// dozens of sessions today would otherwise mean dozens of sequential
// round-trips just for this one reconciliation pass before the page
// could even start rendering, worth avoiding on a hot read path.
const RECORDING_MISSING_LOOKBACK_DAYS = 3;

async function syncRecordingAttentionItems(supabase: SupabaseClient) {
  const lookbackStart = new Date(Date.now() - RECORDING_MISSING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const lookbackDateStr = lookbackStart.toISOString().slice(0, 10);
  const graceCutoff = new Date(Date.now() - RECORDING_GRACE_HOURS * 60 * 60 * 1000);

  const { data: unmatchedRecordings } = await supabase
    .from("meet_recordings")
    .select("id, coach_id, recorded_date, coaches(name)")
    .eq("status", "unmatched")
    .gte("recorded_date", lookbackDateStr);

  if (unmatchedRecordings && unmatchedRecordings.length > 0) {
    // Dedups on recording_id, not student_id like createIfNew above — a
    // recording rarely has a known student_id (that's the whole reason
    // it needs review), so it can't use that index. Per-row RPC calls
    // (attention_item_upsert_recording_unmatched, migration 0082), run
    // in parallel — a plain .upsert() can't match this partial index's
    // WHERE predicate at all, same reasoning as createIfNew's own
    // comment above.
    await Promise.all(
      unmatchedRecordings.map((rec) => {
        const coachName = (rec.coaches as unknown as { name: string } | null)?.name ?? "an unrecognized coach";
        return supabase.rpc("attention_item_upsert_recording_unmatched", {
          p_recording_id: rec.id,
          p_coach_id: rec.coach_id,
          p_summary: `Recording from ${coachName} on ${rec.recorded_date} couldn't be matched to a student`,
        });
      }),
    );
  }

  const { data: candidateSessions } = await supabase
    .from("sessions")
    .select("id, student_id, scheduled_at, duration_minutes, status, students(name), coaches:actual_coach_id(timezone)")
    .gte("scheduled_at", lookbackStart.toISOString())
    .lte("scheduled_at", new Date().toISOString())
    .not("status", "in", `(${NO_RECORDING_EXPECTED_STATUSES.join(",")})`);

  // Past-grace-period only — a session that just ended is too soon to
  // expect a recording yet, same cutoff as before, just filtered up
  // front instead of skipped one at a time in the loop below.
  const dueSessions = (candidateSessions ?? [])
    .filter((s) => {
      const endTime = new Date(s.scheduled_at).getTime() + s.duration_minutes * 60 * 1000;
      return endTime <= graceCutoff.getTime();
    })
    .map((s) => {
      const timezone = (s.coaches as unknown as { timezone: string } | null)?.timezone ?? "America/New_York";
      const [y, m, d] = zonedYearMonthDay(new Date(s.scheduled_at), timezone);
      return {
        id: s.id,
        studentId: s.student_id,
        studentName: (s.students as unknown as { name: string } | null)?.name ?? "Student",
        sessionDate: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      };
    });

  // A session already flagged recording_missing can later turn out to be
  // a no-show, a late-forfeit, or a cancellation — attendance/
  // cancellation status here is often set well after the fact, not at
  // the moment it happens (per this studio's own habits, see comments
  // elsewhere in this file), so a real no-show like Aashi Allani's can
  // sit in the queue looking like a missing recording for a session that
  // never should have expected one. Re-checks every currently open item
  // against its session's current status and resolves any that no
  // longer belong — same "computed fact, safe to auto-resolve" reasoning
  // as the recording-now-exists case below, just working from the other
  // direction. Independent of dueSessions/the early return right below,
  // since a stale item can exist even on a day with nothing newly due.
  const { data: openMissingItems } = await supabase
    .from("attention_items")
    .select("id, sessions(status)")
    .eq("kind", "recording_missing")
    .neq("status", "resolved")
    .not("session_id", "is", null);

  const staleItemIds = (openMissingItems ?? [])
    .filter((item) => {
      const status = (item.sessions as unknown as { status: string } | null)?.status;
      return !!status && NO_RECORDING_EXPECTED_STATUSES.includes(status);
    })
    .map((item) => item.id);

  if (staleItemIds.length > 0) {
    await supabase
      .from("attention_items")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .in("id", staleItemIds);
  }

  if (dueSessions.length === 0) return;

  // One query for every already-matched recording touching today's
  // candidate students, instead of one "does this exact pair exist"
  // query per session — same (student, date) matching, just checked in
  // JS against a batch instead of round-tripping per row. Deliberately
  // no recorded_date floor: a `todayStr` floor here used to exclude a
  // same-day match whose recorded_date lands on the coach's local
  // previous calendar day (any evening EDT session — confirmed live,
  // this silently broke auto-resolve for exactly that case). The
  // matched_student_id filter above already bounds this to a handful of
  // rows (today's due students only), so there's no real query-size
  // reason to add a date floor back.
  const studentIds = [...new Set(dueSessions.map((s) => s.studentId))];
  const { data: matchedRecordings } = await supabase
    .from("meet_recordings")
    .select("matched_student_id, recorded_date")
    .eq("status", "matched")
    .in("matched_student_id", studentIds);

  const matchedKeys = new Set(
    (matchedRecordings ?? []).map((r) => `${r.matched_student_id}|${r.recorded_date}`),
  );

  const resolvedSessionIds: string[] = [];
  const missingRows: { kind: "recording_missing"; session_id: string; student_id: string; summary: string }[] = [];

  for (const s of dueSessions) {
    if (matchedKeys.has(`${s.studentId}|${s.sessionDate}`)) {
      resolvedSessionIds.push(s.id);
    } else {
      missingRows.push({
        kind: "recording_missing",
        session_id: s.id,
        student_id: s.studentId,
        summary: `${s.studentName}'s session on ${s.sessionDate} has no recording yet`,
      });
    }
  }

  if (resolvedSessionIds.length > 0) {
    // The condition that created this (if it did) is no longer true —
    // unlike the 5 kinds above, this one's "resolved" is a computed
    // fact (a recording now exists), not an admin decision, so it's
    // safe and more helpful to auto-resolve rather than wait for a
    // manual click on something that already fixed itself.
    await supabase
      .from("attention_items")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .in("session_id", resolvedSessionIds)
      .eq("kind", "recording_missing")
      .neq("status", "resolved");
  }

  // Dedups on session_id, not student_id — a student missing their
  // recording two different weeks are two separate things to review,
  // unlike e.g. "inactive" which is one ongoing condition. Per-row RPC
  // calls (attention_item_upsert_recording_missing, migration 0082),
  // run in parallel — a plain .upsert() can't match this partial
  // index's WHERE predicate at all, same reasoning as createIfNew's
  // own comment above.
  await Promise.all(
    missingRows.map((row) =>
      supabase.rpc("attention_item_upsert_recording_missing", {
        p_session_id: row.session_id,
        p_student_id: row.student_id,
        p_summary: row.summary,
      }),
    ),
  );
}

// ---- reads ----

export async function getAttentionItems(
  supabase: SupabaseClient,
  status?: AttentionStatus,
  studentId?: string,
): Promise<AttentionItem[]> {
  await syncComputedAttentionItems(supabase);

  let query = supabase
    .from("attention_items")
    .select(
      "id, kind, status, student_id, coach_id, summary, admin_note, created_at, resolved_at, occurrence_at, students(name), coaches(name)",
    )
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (studentId) query = query.eq("student_id", studentId);

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
    occurrenceAt: item.occurrence_at,
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
  //
  // Deliberately NOT scoped to `.eq("status", "pending")` — this also
  // needs to work as a correction after the request is already
  // "approved" (e.g. admin mistakenly confirmed a cancellation and now
  // needs to retain the student instead). The Stop panel now surfaces
  // this same attention_items row regardless of its own status
  // (page.tsx no longer filters to needs_action/in_progress only), so a
  // second click here is a deliberate re-decision, not a stale replay —
  // scoping to "pending" would have silently no-op'd the exact
  // correction this exists to allow.
  if (item?.kind === "cancel_request" && item.request_id && status === "resolved") {
    await supabase
      .from("student_requests")
      .update({ status: requestOutcome, resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
      .eq("id", item.request_id);
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
