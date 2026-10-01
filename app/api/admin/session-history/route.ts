import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

// Full session history for one student, unbounded by the current billing
// cycle and showing every status (attended/no-show/late-forfeit/
// cancelled-*/scheduled) — /api/sessions/upcoming deliberately only shows
// 'scheduled' rows within the current cycle, which has no way to answer
// "what happened at her last session" or "how many times has she no-showed
// this year." Backs the student page's "See all previous sessions" link.
// Relies on "admins can view all sessions" RLS (0007).
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);

  // "Previous sessions" — never future. With no explicit `to`, an
  // unfiltered query returned every row including a recurring student's
  // far-future scheduled sessions, ordered newest-first, so the page
  // showed a year-out 2027 booking before any actual history (confirmed
  // live). Capped here rather than just defaulting the client's date
  // picker, so it holds regardless of what the client sends.
  const now = new Date().toISOString();
  const effectiveTo = to && to < now ? to : now;

  let query = supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, actual_coach_id, status, is_makeup", { count: "exact" })
    .eq("student_id", studentId)
    .lte("scheduled_at", effectiveTo)
    .order("scheduled_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (from) query = query.gte("scheduled_at", from);

  const { data: sessions, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The reason a cancelled session was cancelled isn't stored on the
  // session row itself — it lives on the makeup_credits row THAT
  // cancellation generated (source_session_id), whether student
  // self-service or admin "regular cancel" (both go through
  // applyCancellationCredit). A late cancel with no credit has nowhere
  // this app stores a reason at all (applyCancellationCredit returns
  // before touching makeup_credits), so those stay reason-less here —
  // not a bug in this query, a real gap in what gets captured.
  const cancelledIds = (sessions ?? [])
    .filter((s) => s.status === "cancelled-with-notice")
    .map((s) => s.id);

  let reasonsBySessionId: Record<string, string> = {};
  if (cancelledIds.length) {
    const { data: credits } = await supabase
      .from("makeup_credits")
      .select("source_session_id, reason")
      .in("source_session_id", cancelledIds)
      .not("reason", "is", null);
    reasonsBySessionId = Object.fromEntries(
      (credits ?? [])
        .filter((c) => c.source_session_id && c.reason)
        .map((c) => [c.source_session_id as string, c.reason as string]),
    );
  }

  const sessionsWithReasons = (sessions ?? []).map((s) => ({
    ...s,
    cancel_reason: reasonsBySessionId[s.id] ?? null,
  }));

  return NextResponse.json({ sessions: sessionsWithReasons, total: count ?? 0 });
}
