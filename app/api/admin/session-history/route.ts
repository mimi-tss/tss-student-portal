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

  let query = supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, actual_coach_id, status, is_makeup", { count: "exact" })
    .eq("student_id", studentId)
    .order("scheduled_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (from) query = query.gte("scheduled_at", from);
  if (to) query = query.lte("scheduled_at", to);

  const { data: sessions, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: sessions ?? [], total: count ?? 0 });
}
