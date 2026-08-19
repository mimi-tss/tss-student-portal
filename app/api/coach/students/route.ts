import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lists every student the logged-in coach has access to — currently
// assigned, plus anyone they've ever had a real session with (a
// substitute assignment, a since-reassigned student, etc.), so chat and
// homework-note continuity (migration 0022) is actually reachable
// through the UI, not just permitted at the RLS layer.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", user.id)
    .single();

  if (!coach) return NextResponse.json({ error: "no coach record" }, { status: 404 });

  const [{ data: assigned }, { data: sessionRows }] = await Promise.all([
    supabase.from("students").select("id, name").eq("assigned_coach_id", coach.id),
    supabase.from("sessions").select("student_id").eq("actual_coach_id", coach.id),
  ]);

  const assignedIds = new Set((assigned ?? []).map((s) => s.id));
  const historicalIds = [...new Set((sessionRows ?? []).map((r) => r.student_id))].filter(
    (id) => !assignedIds.has(id),
  );

  let historical: { id: string; name: string }[] = [];
  if (historicalIds.length > 0) {
    const { data } = await supabase.from("students").select("id, name").in("id", historicalIds);
    historical = data ?? [];
  }

  const students = [...(assigned ?? []), ...historical].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return NextResponse.json({ students });
}
