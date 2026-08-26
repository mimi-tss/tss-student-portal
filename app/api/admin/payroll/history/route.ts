import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// Finalized payroll_entries for a period, as JSON — backs the admin
// payroll history table (mark-paid toggle). Same join shape as
// app/api/admin/payroll/export, just JSON instead of CSV.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const periodStart = req.nextUrl.searchParams.get("start");
  const periodEnd = req.nextUrl.searchParams.get("end");
  const coachId = req.nextUrl.searchParams.get("coachId");

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  let query = supabase
    .from("payroll_entries")
    .select(
      "id, amount, paid, is_manual, reason, created_at, coaches(name), sessions(scheduled_at, duration_minutes, students(name)), group_lessons(topic, scheduled_at, duration_minutes)",
    )
    .lte("period_start", periodEnd)
    .gte("period_end", periodStart)
    .order("id");

  if (coachId) query = query.eq("coach_id", coachId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (data ?? []).map((entry) => {
    const coachName = (entry.coaches as unknown as { name: string } | null)?.name ?? "";
    const session = entry.sessions as unknown as {
      scheduled_at: string;
      duration_minutes: number;
      students: { name: string } | null;
    } | null;
    const groupLesson = entry.group_lessons as unknown as {
      topic: string | null;
      scheduled_at: string;
      duration_minutes: number;
    } | null;

    return {
      id: entry.id,
      coachName,
      scheduledAt: session?.scheduled_at ?? groupLesson?.scheduled_at ?? entry.created_at,
      type: entry.is_manual ? "adjustment" : session ? "session" : "group-lesson",
      label: entry.is_manual ? (entry.reason ?? "Adjustment") : session ? session.students?.name ?? "Student" : groupLesson?.topic ?? "Group Lesson",
      durationMinutes: session?.duration_minutes ?? groupLesson?.duration_minutes ?? 0,
      amount: entry.amount,
      paid: entry.paid,
      isManual: entry.is_manual,
    };
  });

  entries.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  return NextResponse.json({ entries });
}
