import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Deactivate/reactivate — never a hard delete. See migration
// 0042_coach_active_status.sql for why. Uses the regular session-scoped
// client since the "admins can update coaches" RLS policy (0041) already
// covers this column.
export async function POST(req: NextRequest) {
  const { coachId, active } = await req.json();

  if (!coachId || typeof active !== "boolean") {
    return NextResponse.json({ error: "coachId and active required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const { data: updated, error } = await supabase.from("coaches").update({ active }).eq("id", coachId).select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "No coach row was updated — check that migration 0041_admin_coach_updates.sql has been applied." },
      { status: 403 },
    );
  }

  return NextResponse.json({ success: true });
}
