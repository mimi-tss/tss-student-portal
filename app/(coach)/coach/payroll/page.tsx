import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCoachPayroll } from "@/lib/payroll/calculate";
import PayrollRangePicker from "./payroll-range-picker";
import styles from "../../coach.module.css";

// Coach's own payroll summary (TSS_App_Spec_1.md section 8). Default
// view is calendar-month-to-date, same UTC-month convention already used
// by lib/booking/cancel-session.ts's cap windows — adjustable to any
// range via PayrollRangePicker, which re-queries app/api/coach/payroll.
// Accepts ?start=&end= so the dashboard's "new payroll" banner can deep-
// link straight to the actual generated period (admin generates for the
// *previous* month by default — this page's own default is the current
// month, so without the deep link a coach clicking through would land
// on a view that doesn't even show what they were just notified about).
export default async function CoachPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { start: startParam, end: endParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, hourly_rate")
    .eq("profile_id", user.id)
    .single();
  if (!coach) redirect("/login");

  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const periodStart = startParam ?? defaultStart;
  const periodEnd = endParam ?? defaultEnd;

  const estimate = await computeCoachPayroll(supabase, coach.id, periodStart, periodEnd);

  const { data: finalized } = await supabase
    .from("payroll_entries")
    .select(
      "id, amount, period_start, period_end, paid, is_manual, reason, sessions(scheduled_at, duration_minutes, students(name)), group_lessons(topic, scheduled_at, duration_minutes)",
    )
    .eq("coach_id", coach.id)
    .lte("period_start", periodEnd)
    .gte("period_end", periodStart)
    .order("period_start", { ascending: false });

  const finalizedIds = (finalized ?? []).map((f) => f.id);
  if (finalizedIds.length > 0) {
    await createAdminClient()
      .from("payroll_entries")
      .update({ coach_seen_at: new Date().toISOString() })
      .in("id", finalizedIds)
      .is("coach_seen_at", null);
  }

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Payroll</h1>
      <PayrollRangePicker
        hourlyRate={coach.hourly_rate}
        initialPeriodStart={periodStart}
        initialPeriodEnd={periodEnd}
        initialEstimate={estimate}
        initialFinalized={(finalized ?? []).map((f) => {
          const session = f.sessions as unknown as {
            scheduled_at: string;
            duration_minutes: number;
            students: { name: string } | null;
          } | null;
          const groupLesson = f.group_lessons as unknown as {
            topic: string | null;
            scheduled_at: string;
            duration_minutes: number;
          } | null;
          return {
            id: f.id,
            amount: f.amount,
            periodStart: f.period_start,
            periodEnd: f.period_end,
            paid: f.paid,
            scheduledAt: session?.scheduled_at ?? groupLesson?.scheduled_at ?? null,
            label: f.is_manual
              ? (f.reason ?? "Adjustment")
              : session
                ? (session.students?.name ?? "Student")
                : (groupLesson?.topic ?? "Group Lesson"),
            isManual: f.is_manual,
          };
        })}
      />
    </main>
  );
}
