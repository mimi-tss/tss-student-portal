import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Coach or admin assigns a catalog exercise to a student (spec section
// 8: "Assign exercises to a student from a dropdown" — admin now has
// the same ability from the student detail view). RLS (migration 0024,
// widened by 0036) enforces the actual scoping: a coach can only assign
// to their own students, admin to anyone. assigned_by_coach_id is left
// null for an admin-made assignment (migration 0036 made the column
// nullable) since admin has no coaches row.
export async function POST(req: NextRequest) {
  const { exerciseId, studentId } = await req.json();

  if (!exerciseId || !studentId) {
    return NextResponse.json({ error: "exerciseId and studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!coach && !isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "only coaches or admin can assign exercises" }, { status: 403 });
  }

  const { error } = await supabase.from("exercise_assignments").insert({
    exercise_id: exerciseId,
    student_id: studentId,
    assigned_by_coach_id: coach?.id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
