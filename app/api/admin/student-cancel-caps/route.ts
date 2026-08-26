import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Feeds AdminCancelButtons' "remaining this month/year" preview when it's
// opened from somewhere that doesn't already have these two counts loaded
// (the student detail page fetches them itself; the Coaches page's
// click-a-session-to-cancel shortcut doesn't, so it asks here instead).
// Same query/window as app/(admin)/admin/students/[studentId]/page.tsx.
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [{ count: monthlyCreditsUsed }, { count: yearlyCreditsUsed }] = await Promise.all([
    supabase
      .from("makeup_credits")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("type", "student-fault")
      .gte("created_at", monthStart),
    supabase
      .from("makeup_credits")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("type", "student-fault")
      .gte("created_at", yearStart),
  ]);

  return NextResponse.json({
    monthlyCreditsUsed: monthlyCreditsUsed ?? 0,
    yearlyCreditsUsed: yearlyCreditsUsed ?? 0,
  });
}
