import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStudentSnapshot } from "@/lib/coach/dashboard-data";
import { listAssignedExercises } from "@/lib/exercises";

// Lazy per-student fetch for the coach dashboard's detail panel — called
// when the coach selects a different student, rather than preloading
// every student's snapshot/notes up front. driveFolderId is just the
// student's drive_folder_id column, not a Drive API call — the shared
// folder's actual file listing is fetched separately by
// SharedFolderPanel itself (GET /api/shared-folder/list), not bundled
// in here, so switching students doesn't pay for a Drive round-trip it
// doesn't need.
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

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

  // RLS ("coaches can view assignments/students they've had a session
  // with") already scopes every query inside getStudentSnapshot — a
  // coach with no access to this student simply gets nulls/empty back,
  // same 404-not-403 pattern used elsewhere.
  const snapshot = await getStudentSnapshot(supabase, coach.id, studentId);
  if (!snapshot) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const { data: student } = await supabase
    .from("students")
    .select("drive_folder_id")
    .eq("id", studentId)
    .maybeSingle();

  const assignedExercises = await listAssignedExercises(supabase, studentId);

  return NextResponse.json({
    snapshot,
    driveFolderId: student?.drive_folder_id ?? null,
    assignedExercises,
  });
}
