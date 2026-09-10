import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingStudent } from "@/lib/billing/student-stripe-link";
import { createAttentionItem } from "@/lib/admin/attention-items";
import { notifyStaff } from "@/lib/notifications/create";

// Pausing is never instant/self-service — this only ever creates a
// request that alerts admin (Needs Review + Slack); admin approving it
// is what actually pauses billing in Stripe (see
// lib/admin/attention-items.ts's resolveAttentionItem). Mirrors the
// pre-existing self-service cancel flow's shape
// (app/api/student/requests/route.ts).
export async function POST(req: NextRequest) {
  const { resumeDate, reason } = await req.json();

  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }
  if (typeof resumeDate !== "string") {
    return NextResponse.json({ error: "resumeDate required" }, { status: 400 });
  }
  const resumeMs = Date.parse(resumeDate);
  if (Number.isNaN(resumeMs) || resumeMs <= Date.now()) {
    return NextResponse.json({ error: "resumeDate must be a valid future date" }, { status: 400 });
  }

  const billingStudent = await resolveBillingStudent();
  if (!billingStudent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("student_requests")
    .select("id")
    .eq("student_id", billingStudent.studentId)
    .eq("type", "pause_subscription")
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already have a pending pause request." }, { status: 409 });
  }

  const { data: inserted, error } = await supabase
    .from("student_requests")
    .insert({
      student_id: billingStudent.studentId,
      type: "pause_subscription",
      reason: reason.trim(),
      effective_date: resumeDate,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "Couldn't submit request." }, { status: 500 });
  }

  const admin = createAdminClient();
  await createAttentionItem(admin, {
    kind: "pause_request",
    studentId: billingStudent.studentId,
    requestId: inserted.id,
    summary: `${billingStudent.name} requested to pause until ${resumeDate} · reason: ${reason.trim()}`,
  });
  await notifyStaff(admin, {
    kind: "pause_request",
    dedupKey: inserted.id,
    text: `⏸️ ${billingStudent.name} requested to pause their subscription until ${resumeDate}. See Needs Review.`,
  });

  return NextResponse.json({ success: true });
}
