import type { createClient } from "@/lib/supabase/server";
import { MONTHLY_CAP, YEARLY_CAP } from "@/lib/booking/cancellation-caps";

const NOTICE_HOURS = 24;
const CREDIT_EXPIRY_DAYS = 30;

interface SessionForCancel {
  id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  is_makeup: boolean;
  makeup_credit_id: string | null;
}

export interface CancelOutcome {
  creditGranted: boolean;
  creditReinstated: boolean;
  creditExpiresAt: string | null;
}

// Core cancellation rules (spec section 5/6), shared by the student
// self-service cancel route and the admin "regular cancel" route — same
// outcome either way: 24+ hours notice earns a capped student-fault
// session credit (1/month, 6/year, checked explicitly here rather than
// relying on the student RLS policy's own cap check, since admin's
// insert policy has no cap of its own to lean on). Rescheduling a
// session that was itself booked with a credit gives back that same
// credit instead of minting a new one — uncapped, since nothing new is
// being earned. Caller handles auth/ownership and updates the session's
// status afterward; this only decides + applies the credit side effect.
export async function applyCancellationCredit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: SessionForCancel,
  reason?: string | null,
): Promise<CancelOutcome> {
  const scheduledAt = new Date(session.scheduled_at);
  const hoursNotice = (scheduledAt.getTime() - Date.now()) / (60 * 60 * 1000);
  const withinNoticeWindow = hoursNotice >= NOTICE_HOURS;

  if (withinNoticeWindow && session.is_makeup && session.makeup_credit_id) {
    const { data: reinstated, error } = await supabase
      .from("makeup_credits")
      .update({ used: false, used_session_id: null, reason: reason?.trim() || null })
      .eq("id", session.makeup_credit_id)
      .select("expires_at")
      .maybeSingle();

    if (!error && reinstated) {
      return { creditGranted: true, creditReinstated: true, creditExpiresAt: reinstated.expires_at };
    }
    return { creditGranted: false, creditReinstated: false, creditExpiresAt: null };
  }

  if (!withinNoticeWindow) {
    return { creditGranted: false, creditReinstated: false, creditExpiresAt: null };
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [{ count: monthlyCount }, { count: yearlyCount }] = await Promise.all([
    supabase
      .from("makeup_credits")
      .select("id", { count: "exact", head: true })
      .eq("student_id", session.student_id)
      .eq("type", "student-fault")
      .gte("created_at", monthStart),
    supabase
      .from("makeup_credits")
      .select("id", { count: "exact", head: true })
      .eq("student_id", session.student_id)
      .eq("type", "student-fault")
      .gte("created_at", yearStart),
  ]);

  const atCap = (monthlyCount ?? 0) >= MONTHLY_CAP || (yearlyCount ?? 0) >= YEARLY_CAP;
  if (atCap) {
    return { creditGranted: false, creditReinstated: false, creditExpiresAt: null };
  }

  const expiresAt = new Date(
    scheduledAt.getTime() + CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: creditError } = await supabase.from("makeup_credits").insert({
    student_id: session.student_id,
    type: "student-fault",
    source_session_id: session.id,
    expires_at: expiresAt,
    reason: reason?.trim() || null,
    // Snapshot the actual missed session's length, not the student's
    // current default — those can drift apart (e.g. the 60-min add-on
    // gets removed later; the credit should still represent what was
    // actually lost).
    duration_minutes: session.duration_minutes,
  });

  if (creditError) {
    return { creditGranted: false, creditReinstated: false, creditExpiresAt: null };
  }

  return { creditGranted: true, creditReinstated: false, creditExpiresAt: expiresAt };
}

export function cancellationMessage(outcome: CancelOutcome): string {
  if (outcome.creditReinstated) {
    return "Session cancelled — the session credit used to book this has been given back, so it can be rescheduled.";
  }
  if (outcome.creditGranted) {
    return "Session cancelled — a session credit was issued, good for 30 days.";
  }
  return "Session cancelled. No credit was issued (inside the 24-hour notice window, or already at the credit limit for this period), but a new time can still be booked.";
}
