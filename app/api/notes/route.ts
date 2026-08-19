import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Homework notes (TSS_App_Spec_1.md section 8) — a dated running log per
// student, visible to the student, written by whichever coach currently
// or previously worked with them. RLS (migration 0022) already scopes
// SELECT/INSERT correctly per role, so this route just resolves which
// studentId to use and lets Postgres enforce the rest — same pattern as
// /api/sessions/upcoming.
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const requestedStudentId = req.nextUrl.searchParams.get("studentId");

  let studentId: string;
  if (requestedStudentId) {
    studentId = requestedStudentId;
  } else {
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!student) {
      return NextResponse.json({ error: "student not found" }, { status: 404 });
    }
    studentId = student.id;
  }

  const { data: notes, error } = await supabase
    .from("homework_notes")
    .select("id, note, pinned, created_at, coach_id, coaches(name)")
    .eq("student_id", studentId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: notes ?? [] });
}

// Coach-only — RLS also enforces this (insert policy requires
// coach_id = auth_coach_id()), checked again here so a non-coach gets a
// clear error instead of a silent RLS-denied insert failure.
export async function POST(req: NextRequest) {
  const { studentId, note, pinned } = await req.json();

  if (!studentId || !note?.trim()) {
    return NextResponse.json({ error: "studentId and note required" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!coach) {
    return NextResponse.json({ error: "only coaches can add homework notes" }, { status: 403 });
  }

  const { data: created, error } = await supabase
    .from("homework_notes")
    .insert({
      student_id: studentId,
      coach_id: coach.id,
      note: note.trim(),
      pinned: !!pinned,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: created.id });
}
