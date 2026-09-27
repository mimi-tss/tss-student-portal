import type { SupabaseClient } from "@supabase/supabase-js";
import { fifthWeekOccurrence } from "@/lib/scheduling/recurring";
import { getHolidayDateKeys } from "@/lib/scheduling/holidays";
import { getStripeClient } from "@/lib/stripe/client";
import { formatPrice } from "@/lib/stripe/tiers";

// "Bonus week" lessons students can buy themselves: a Pro/Elite student on
// a weekly schedule whose current billing cycle has a 5th occurrence of
// their lesson day (not covered by the 4-lesson plan). Same eligibility as
// the admin "5th Week" Needs Review item (lib/admin/attention-items.ts,
// syncFifthWeekAttentionItems) — both lean on fifthWeekOccurrence().
// Used by the offer cron, the student dashboard card, and the buy route
// (which re-checks right before charging).

// Master switch for the student self-serve side (dashboard card + buy
// route), which charges real cards. Off until the studio signs off on a
// live test; flip to true to launch. Offer emails are separately held by
// STUDENT_NOTIFICATIONS_PAUSED.
export const FIFTH_WEEK_SELF_SERVE_ENABLED = false;

export interface FifthWeekOpportunity {
  studentId: string;
  studentName: string;
  email: string;
  phone: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyInApp: boolean;
  coachId: string;
  coachName: string;
  coachTimezone: string;
  occurrenceAt: Date;
  durationMinutes: number;
  // Tara's own students never get a bonus lesson — they just get a
  // "no lesson that week" heads-up (studio call 2026-09-26).
  noBonusLesson: boolean;
}

// Tara's weekly students: no 5th-week lesson, ever. Matched by name —
// there's one Tara on staff and no coach flag for this.
export function isTaraCoach(coachName: string | null | undefined): boolean {
  return /^tara\b/i.test((coachName ?? "").trim());
}

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface ScheduleRow {
  student_id: string;
  coach_id: string;
  day_of_week: number;
  start_time: string;
  students: One<{
    name: string;
    email: string;
    phone: string | null;
    tier: string;
    subscription_status: string;
    billing_anniversary_date: string | null;
    session_duration_minutes: number | null;
    archived: boolean;
    notify_alerts_email: boolean;
    notify_alerts_sms: boolean;
    notify_alerts_inapp: boolean;
  }>;
  coaches: One<{ name: string; timezone: string }>;
}

export async function findFifthWeekOpportunities(
  admin: SupabaseClient,
  opts: { studentId?: string; now?: Date } = {},
): Promise<FifthWeekOpportunity[]> {
  const now = opts.now ?? new Date();
  let q = admin
    .from("recurring_schedules")
    .select(
      "student_id, coach_id, day_of_week, start_time, " +
        "students(name, email, phone, tier, subscription_status, billing_anniversary_date, session_duration_minutes, archived, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp), " +
        "coaches(name, timezone)",
    )
    .eq("active", true)
    .eq("cadence", "weekly");
  if (opts.studentId) q = q.eq("student_id", opts.studentId);
  const { data } = await q;
  const schedules = (data ?? []) as unknown as ScheduleRow[];
  if (!schedules.length) return [];

  const holidayDates = await getHolidayDateKeys(admin);
  const found: FifthWeekOpportunity[] = [];
  for (const s of schedules) {
    const st = one(s.students);
    const coach = one(s.coaches);
    if (!st || st.archived) continue;
    if (st.tier !== "pro" && st.tier !== "elite") continue;
    if (st.subscription_status !== "active") continue;
    const tz = coach?.timezone ?? "America/New_York";
    const occurrenceAt = fifthWeekOccurrence(s.day_of_week, s.start_time, tz, now, st.billing_anniversary_date, holidayDates);
    if (!occurrenceAt) continue;
    found.push({
      studentId: s.student_id,
      studentName: st.name,
      email: st.email,
      phone: st.phone,
      notifyEmail: st.notify_alerts_email,
      notifySms: st.notify_alerts_sms,
      notifyInApp: st.notify_alerts_inapp,
      coachId: s.coach_id,
      coachName: coach?.name ?? "",
      coachTimezone: tz,
      occurrenceAt,
      durationMinutes: st.session_duration_minutes ?? 30,
      noBonusLesson: isTaraCoach(coach?.name),
    });
  }
  if (!found.length) return [];

  // Already booked at that exact time (they bought it, or admin added it)
  // — nothing left to offer.
  const { data: existing } = await admin
    .from("sessions")
    .select("student_id, scheduled_at")
    .in("student_id", found.map((f) => f.studentId))
    .in("scheduled_at", found.map((f) => f.occurrenceAt.toISOString()))
    .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,holiday)");
  const taken = new Set((existing ?? []).map((r) => `${r.student_id}|${new Date(r.scheduled_at as string).toISOString()}`));
  return found.filter((f) => !taken.has(`${f.studentId}|${f.occurrenceAt.toISOString()}`));
}

// Stripe price for the lesson: the existing "1 Lesson Add-On" prices
// (lib/billing/addons.ts). Elite pays the same as Pro (studio call
// 2026-09-26).
export function fifthWeekPriceId(durationMinutes: number): string | null {
  const envVar = durationMinutes >= 60 ? "STRIPE_PRICE_ADDON_SINGLE_LESSON_60MIN_PRO" : "STRIPE_PRICE_ADDON_SINGLE_LESSON_PRO";
  return process.env[envVar] || null;
}

// Price for display + charging. Catalog prices live on the "own" Stripe
// account even for legacy (Opus) students — same as the add-on shop
// (app/api/billing/addons/purchase). null when not configured.
export async function fifthWeekPrice(
  durationMinutes: number,
): Promise<{ priceId: string; amount: number; currency: string; label: string } | null> {
  const priceId = fifthWeekPriceId(durationMinutes);
  if (!priceId) return null;
  try {
    const price = await getStripeClient("own").prices.retrieve(priceId);
    if (price.unit_amount == null) return null;
    return {
      priceId,
      amount: price.unit_amount,
      currency: price.currency,
      label: formatPrice(price.unit_amount, price.currency) ?? "",
    };
  } catch (err) {
    console.error(`fifthWeekPrice: couldn't read ${priceId}`, err);
    return null;
  }
}
