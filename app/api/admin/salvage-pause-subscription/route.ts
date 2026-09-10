import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getStripeClient } from "@/lib/stripe/client";
import type { StripeAccount } from "@/types/database";

const SALVAGE_PAUSE_DAYS = 60;

// Admin's "let me try to win them back" action on a cancel request —
// pauses billing immediately WITHOUT resolving the underlying
// attention_items row, so it stays in_progress while admin works it.
// The 60-day resume date is just a safety net in case admin forgets to
// follow up — resolving the item as retained (resumes billing right
// away, see lib/admin/attention-items.ts) or cancelled (schedules the
// real cancellation) before then supersedes it either way.
//
// Explicit role check (not just RLS) since this calls Stripe directly —
// no DB write here for RLS to gate on, unlike most admin routes.
export async function POST(req: NextRequest) {
  const { studentId } = await req.json();
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const { data: student } = await supabase
    .from("students")
    .select("stripe_customer_id, stripe_subscription_id, stripe_account")
    .eq("id", studentId)
    .maybeSingle();

  if (!student?.stripe_customer_id || !student.stripe_subscription_id || !student.stripe_account) {
    return NextResponse.json({ error: "This student has no Stripe billing account." }, { status: 404 });
  }

  try {
    const client = getStripeClient(student.stripe_account as StripeAccount);
    const resumesAt = Math.floor((Date.now() + SALVAGE_PAUSE_DAYS * 24 * 60 * 60 * 1000) / 1000);
    await client.subscriptions.update(student.stripe_subscription_id, {
      pause_collection: { behavior: "void", resumes_at: resumesAt },
    });
  } catch (err) {
    console.error("salvage-pause-subscription failed", err);
    const message = err instanceof Error ? err.message : "Couldn't pause this subscription in Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
