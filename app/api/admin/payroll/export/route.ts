import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// Hand-built CSV export of finalized payroll_entries for a period — an
// export layer, not a full payroll system (TSS_App_Spec_1.md section 6):
// real disbursement happens through Gusto/Deel/QuickBooks, this just
// hands them an importable file.
function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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
      "id, amount, paid, period_start, period_end, is_manual, reason, created_at, coaches(name), sessions(scheduled_at, duration_minutes, students(name)), group_lessons(topic, scheduled_at, duration_minutes)",
    )
    .lte("period_start", periodEnd)
    .gte("period_end", periodStart)
    .order("period_start");

  if (coachId) query = query.eq("coach_id", coachId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = [["Coach", "Date", "Type", "Student / Topic", "Duration (min)", "Amount", "Paid"]];
  for (const entry of data ?? []) {
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

    const scheduledAt = session?.scheduled_at ?? groupLesson?.scheduled_at ?? (entry.is_manual ? entry.created_at : "");
    const type = entry.is_manual ? "Adjustment" : session ? "Session" : "Group Lesson";
    const label = entry.is_manual ? (entry.reason ?? "Adjustment") : session ? session.students?.name ?? "Student" : groupLesson?.topic ?? "Group Lesson";
    const duration = session?.duration_minutes ?? groupLesson?.duration_minutes ?? "";

    rows.push([
      coachName,
      scheduledAt ? new Date(scheduledAt).toLocaleString() : "",
      type,
      label,
      String(duration),
      entry.amount.toFixed(2),
      entry.paid ? "Yes" : "No",
    ]);
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payroll_${periodStart.slice(0, 10)}_${periodEnd.slice(0, 10)}.csv"`,
    },
  });
}
