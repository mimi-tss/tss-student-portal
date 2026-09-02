import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// In-app notifications for the logged-in student. Uses the normal
// (non-admin) client so RLS ("students can view/mark their own
// notifications", migration 0083) does the scoping — no explicit
// student_id filter needed on GET, and PATCH's own filter is just
// belt-and-suspenders on top of the RLS policy.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const { data: student } = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, group_key, kind, title, body, link_url, read_at, created_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

// Mark one notification (id) or all unread ones (all: true) as read.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not logged in" }, { status: 401 });
  }

  const { data: student } = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  const { id, all } = await req.json();
  if (!id && !all) {
    return NextResponse.json({ error: "id or all is required" }, { status: 400 });
  }

  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("student_id", student.id);
  query = all ? query.is("read_at", null) : query.eq("id", id);

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
