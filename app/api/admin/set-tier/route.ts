import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_TIERS = ["lite", "suite", "pro", "elite"];

// Manual admin override of a student's membership tier — normally this
// column is only ever written by the Kajabi webhook's purchase.created
// handler (app/api/webhooks/kajabi/route.ts) or, for a Stripe-billed
// student, the Stripe webhook (app/api/webhooks/stripe/route.ts). A
// blind update, same as those webhooks' own upserts, so it's a stopgap
// rather than a lock: the next real event overwrites it again exactly as
// if this override never happened.
export async function POST(req: NextRequest) {
  const { studentId, tier } = await req.json();

  if (!studentId || !VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: "studentId and a valid tier required" }, { status: 400 });
  }

  const supabase = await createClient();

  // For a Stripe-billed student, "the next real event overwrites it
  // again" is no longer a rare, admin-visible edge case — an unrelated
  // subscription.updated event (e.g. Stripe's own retry/renewal
  // bookkeeping) could silently revert this at any time. Point admin at
  // the real source of truth instead of letting them believe this stuck.
  const { data: existing } = await supabase
    .from("students")
    .select("stripe_customer_id")
    .eq("id", studentId)
    .single();

  if (existing?.stripe_customer_id) {
    return NextResponse.json(
      { error: "This student is billed via Stripe — change their tier from the Stripe Dashboard/Billing Portal instead, not here." },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("students").update({ tier }).eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
