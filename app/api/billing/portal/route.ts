import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

// Authenticated — resolves the logged-in student's own stripe_customer_id
// via their session, same RLS-scoped pattern as app/api/student/requests.
// The Billing Portal session itself carries all upgrade/downgrade/cancel/
// card-change UI; this route only ever mints the one-time session URL.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: student } = await supabase
    .from("students")
    .select("stripe_customer_id")
    .eq("profile_id", user.id)
    .single();

  if (!student?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found for this student." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: student.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_BILLING_URL}/billing/account`,
  });

  return NextResponse.json({ url: session.url });
}
