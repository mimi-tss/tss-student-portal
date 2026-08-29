import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerStudentInRecurringSeries } from "@/lib/group-lessons";

// Registers a student into every future, non-cancelled occurrence of a
// recurring group-lesson series in one action — the bulk counterpart to
// /api/admin/group-lessons/register (which stays for a single-occurrence
// drop-in). Same admin-confirms-payment-manually posture, no live Stripe
// integration.
export async function POST(req: NextRequest) {
  const { seriesId, studentId, stripeReference } = await req.json();

  if (!seriesId || !studentId) {
    return NextResponse.json({ error: "seriesId and studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const result = await registerStudentInRecurringSeries(supabase, {
      seriesId,
      studentId,
      stripeReference,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't register student" },
      { status: 500 },
    );
  }
}
