import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { billingIntervalFromPrice } from "@/lib/stripe/tiers";
import { paidThroughEnd } from "@/lib/scheduling/recurring";
import { isAdminRole } from "@/lib/auth/roles";
import type { StripeAccount } from "@/types/database";

// One-off maintenance route: students.billing_interval was only ever set
// for manually-provisioned students, and the subscription webhook only
// started mirroring it once paidThroughEnd began reading it — so every
// existing 6-month/yearly Stripe subscriber would otherwise be treated
// as monthly (only seeing a month of lessons ahead) until their next
// subscription event. This reads each linked student's live subscription
// across both Stripe accounts and stores its interval. Also reports, for
// every prepaid (non-monthly) student, Stripe's real current_period_end
// next to what paidThroughEnd computes from billing_anniversary_date, so
// a wrong anchor shows up here to be corrected in Edit student.
// Admin-session-gated GET so it runs by visiting the URL in a logged-in
// admin tab (same reasoning as backfill-stripe-links/route.ts).
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  return isAdminRole(profile?.role);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: students, error } = await admin
    .from("students")
    .select("id, name, stripe_customer_id, stripe_account, billing_interval, billing_anniversary_date")
    .not("stripe_customer_id", "is", null)
    .eq("archived", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  const prepaid: {
    name: string;
    interval: string;
    stripePeriodEnd: string | null;
    computedPaidThrough: string;
    anchor: string | null;
  }[] = [];
  const noSubscription: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const student of students ?? []) {
    const account = (student.stripe_account ?? "own") as StripeAccount;
    try {
      const subs = await getStripeClient(account).subscriptions.list({
        customer: student.stripe_customer_id!,
        status: "all",
        limit: 10,
      });
      const live = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
      if (!live) {
        noSubscription.push(student.name);
        continue;
      }

      const item = live.items.data[0];
      const interval = billingIntervalFromPrice(item?.price);
      counts[interval ?? "unknown"] = (counts[interval ?? "unknown"] ?? 0) + 1;
      if (!interval) continue;

      if (interval !== student.billing_interval) {
        await admin.from("students").update({ billing_interval: interval }).eq("id", student.id);
      }

      if (interval !== "monthly") {
        prepaid.push({
          name: student.name,
          interval,
          stripePeriodEnd: item?.current_period_end
            ? new Date(item.current_period_end * 1000).toISOString().slice(0, 10)
            : null,
          computedPaidThrough: paidThroughEnd(student.billing_anniversary_date, interval)
            .toISOString()
            .slice(0, 10),
          anchor: student.billing_anniversary_date,
        });
      }
    } catch (err) {
      failed.push({ name: student.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ checked: students?.length ?? 0, counts, prepaid, noSubscription, failed });
}
