import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Open <-> resolved toggle for /admin/bug-reports. Writes through the
// admin's own session — bug_reports RLS (migration 0109) is is_admin().
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const { id, status } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || (status !== "open" && status !== "resolved")) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const resolved = status === "resolved";
  const { error } = await supabase
    .from("bug_reports")
    .update({
      status,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
