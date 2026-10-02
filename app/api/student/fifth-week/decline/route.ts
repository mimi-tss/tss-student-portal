import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { FIFTH_WEEK_DECLINED_KIND, fifthWeekDeclinedKey } from "@/lib/scheduling/fifth-week-offers";

// ✕ on the dashboard "extra lesson" card: hides it for that week (the
// "last chance" reminder still goes out). Same student resolution as the
// buy route next door.
export async function POST(req: NextRequest) {
  const { occurrenceAt } = (await req.json().catch(() => ({}))) as { occurrenceAt?: string };
  if (!occurrenceAt || Number.isNaN(new Date(occurrenceAt).getTime())) {
    return NextResponse.json({ error: "occurrenceAt required" }, { status: 400 });
  }
  const billing = await resolveBillingStudent();
  if (!billing) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await createAdminClient()
    .from("notification_log")
    .insert({
      recipient_type: "student",
      recipient_id: billing.studentId,
      kind: FIFTH_WEEK_DECLINED_KIND,
      dedup_key: fifthWeekDeclinedKey(billing.studentId, occurrenceAt),
    });
  if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
