import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

// Admin-triggered version of app/api/billing/portal/route.ts — same
// Billing Portal session, just resolved from a studentId an admin picked
// on the Billing page instead of the caller's own session. Useful
// mid-support-conversation ("here's a link to update your card").
export async function POST(req: NextRequest) {
  const { studentId } = await req.json();
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("stripe_customer_id")
    .eq("id", studentId)
    .single();

  if (!student?.stripe_customer_id) {
    return NextResponse.json({ error: "This student has no Stripe billing account." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: student.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_BILLING_URL}/billing/account`,
  });

  return NextResponse.json({ url: session.url });
}
