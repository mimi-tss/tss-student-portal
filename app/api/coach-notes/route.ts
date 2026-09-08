import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Coach notes — like homework_notes but never visible to the student
// at all, not even a single latest one (migration 0100). Unlike
// /api/notes, there's no "resolve the caller's own studentId" branch:
// a student is never the caller here, RLS on coach_notes has no
// student SELECT policy at all, so studentId must always be passed
// explicitly by a coach or admin viewing a specific student's page.
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const { data: notes, error } = await supabase
    .from("coach_notes")
    .select("id, note, created_at, coach_id, coaches(name)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: notes ?? [] });
}

// Coach or admin — RLS also enforces this (insert policy requires
// coach_id = auth_coach_id(), or is_admin()), checked again here so
// anyone else gets a clear error instead of a silent RLS-denied insert
// failure. Same posture as /api/notes.
export async function POST(req: NextRequest) {
  const { studentId, note } = await req.json();

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!coach && !isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "only coaches or admin can add coach notes" }, { status: 403 });
  }

  const { data: created, error } = await supabase
    .from("coach_notes")
    .insert({
      student_id: studentId,
      coach_id: coach?.id ?? null,
      note: note.trim(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: created.id });
}
