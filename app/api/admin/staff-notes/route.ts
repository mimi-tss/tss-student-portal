import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin-only internal notes on a student (migration 0037) — RLS
// (is_admin()) enforces the actual access control on both read and
// write; a non-admin gets an empty list / RLS-denied insert, same
// pattern as the other admin-only routes (e.g. set-pause-status).
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: notes, error } = await supabase
    .from("staff_notes")
    .select("id, note, pinned, created_at")
    .eq("student_id", studentId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: notes ?? [] });
}

// Toggles pinned on a single note — e.g. sibling/family info worth
// keeping visible above newer notes. Relies on the admin-update RLS
// policy added alongside the pinned column (migration 0071).
export async function PATCH(req: NextRequest) {
  const { id, pinned } = await req.json();

  if (!id || typeof pinned !== "boolean") {
    return NextResponse.json({ error: "id and pinned required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("staff_notes").update({ pinned }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const { studentId, note } = await req.json();

  if (!studentId || !note?.trim()) {
    return NextResponse.json({ error: "studentId and note required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("staff_notes")
    .insert({ student_id: studentId, note: note.trim() })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: created.id });
}
