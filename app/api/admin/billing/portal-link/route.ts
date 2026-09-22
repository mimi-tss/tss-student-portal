import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe/client";
import type { StripeAccount } from "@/types/database";

// Admin-triggered version of app/api/billing/portal/route.ts — same
// Billing Portal session, just resolved from a studentId an admin picked
// on the Billing page instead of the caller's own session. Useful
// mid-support-conversation ("here's a link to update your card").
//
// Customer IDs are account-scoped, so this has to use whichever Stripe
// account the student's actually linked to (student.stripe_account) —
// confirmed live that most linked students (79 of 103) are on the
// legacy "opus" account, not "own", and this always called the "own"
// client regardless, so the button failed for most students.
export async function POST(req: NextRequest) {
  const { studentId } = await req.json();
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("stripe_customer_id, stripe_account")
    .eq("id", studentId)
    .single();

  if (!student?.stripe_customer_id) {
    return NextResponse.json({ error: "This student has no Stripe billing account." }, { status: 404 });
  }

  const client = getStripeClient((student.stripe_account as StripeAccount) ?? "own");
  const session = await client.billingPortal.sessions.create({
    customer: student.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/account`,
  });

  return NextResponse.json({ url: session.url });
}
