import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";
import { createSubscriptionCheckoutSession } from "@/lib/stripe/checkout";
import type { Tier } from "@/types/database";

const VALID_TIERS: Tier[] = ["lite", "suite", "pro", "elite"];

// Admin's counterpart to the public pricing page's own checkout
// (app/api/billing/checkout/route.ts) — for a real sale that didn't go
// through that page itself (a phone call, an in-person sign-up). Unlike
// the "Add ambassador / manual student" form's default path
// (lib/admin/provision-student.ts), this never inserts a `students` row
// directly — Stripe Checkout collects the actual payment, and the
// existing webhook (app/api/webhooks/stripe/route.ts) provisions the
// student the exact same way it already does for a real self-serve
// signup, once payment completes. Nothing to build here beyond wiring a
// real Checkout Session up for admin to send/open. Unlike the public
// route, Elite is allowed — that tier's public-page gate (mailto instead
// of Checkout) is about the marketing page's own funnel, not a real
// restriction admin needs to honor when setting one up directly.
export async function POST(req: NextRequest) {
  const { tier, interval, email, addonIds } = await req.json();

  if (typeof tier !== "string" || !VALID_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "A valid tier is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const result = await createSubscriptionCheckoutSession({
    tier: tier as Tier,
    interval,
    addonIds,
    email: typeof email === "string" && email.trim() ? email.trim() : undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}
