import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Studio-wide closure dates (studio_holidays, migration 0055). Not
// finance-gated — this is scheduling policy, not money, same isAdminRole
// boundary as coach-active/coach-info (both admin and admin_finance).
async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  return isAdminRole(profile?.role);
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("studio_holidays").select("id, date, label").order("date");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ holidays: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { date, label } = await req.json();
  if (!date) {
    return NextResponse.json({ error: "date required" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const { error } = await supabase.from("studio_holidays").insert({ date, label: label?.trim() || null });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That date is already on the holiday list." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const { error } = await supabase.from("studio_holidays").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
