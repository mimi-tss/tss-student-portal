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
    // 23505 = unique_violation — exercise_assignments_exercise_student_unique
    // (migration 0052) rejects assigning the same exercise to the same
    // student twice.
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already assigned to this student." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Unassign — RLS (migration 0074) scopes a coach's delete to their own
// students, same as their select policy; admin is already covered by the
// existing "admins can manage exercise assignments" for-all policy. A
// coach can unassign an admin-made assignment and vice versa (both share
// the same student-scoped view), matching this route's existing
// coach/admin parity for assigning.
export async function DELETE(req: NextRequest) {
  const { assignmentId } = await req.json();

  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("exercise_assignments")
    .delete({ count: "exact" })
    .eq("id", assignmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // RLS silently filters rows the caller isn't scoped to rather than
  // erroring — a 0-row delete means "not found or not yours", not success.
  if (!count) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
