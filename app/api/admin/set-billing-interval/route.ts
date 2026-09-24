import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BILLING_INTERVALS } from "@/lib/stripe/tiers";

// Sets students.billing_interval (migration 0107) — how long a term the
// student has prepaid. paidThroughEnd (lib/scheduling/recurring.ts)
// reads it: a 6-month/yearly student sees and can cancel lessons through
// their whole term, anchored on billing_anniversary_date. Stripe-billed
// students get this set automatically by the subscription webhook; this
// is for manual/Kajabi/comped accounts. null clears it (= monthly).
// RLS ("admins can update all students", 0007) enforces admin-only.
export async function POST(req: NextRequest) {
  const { studentId, billingInterval } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }
  if (billingInterval && !(BILLING_INTERVALS as string[]).includes(billingInterval)) {
    return NextResponse.json({ error: "invalid billingInterval" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ billing_interval: billingInterval || null })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
