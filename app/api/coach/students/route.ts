import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCoachStudents } from "@/lib/coach/dashboard-data";

// Lists every student the logged-in coach has access to — currently
// assigned, anyone they've ever had a real 1:1 session with, plus anyone
// ever registered in one of their group lessons (getCoachStudents' own
// comment has the full reasoning) — so chat and homework-note continuity
// is actually reachable through the UI, not just permitted at the RLS
// layer. Reuses the same lib function "My Students" itself calls,
// rather than a second, previously-drifted copy of the same query.
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

  const students = await getCoachStudents(supabase, coach.id);

  return NextResponse.json({ students: students.map((s) => ({ id: s.id, name: s.name })) });
}
