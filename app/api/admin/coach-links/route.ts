import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Edits coaches.meet_link — not a money field, so both admin and
// admin_finance can edit it (isAdminRole), unlike coach-rate's
// hasFinanceRole gate. Uses the "admins can update coaches" RLS policy
// (0041), same hardened zero-rows check as coach-active/route.ts.
export async function POST(req: NextRequest) {
  const { coachId, meetLink } = await req.json();

  if (!coachId || meetLink === undefined) {
    return NextResponse.json({ error: "coachId and meetLink are required" }, { status: 400 });
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

  const { data: updated, error } = await supabase
    .from("coaches")
    .update({ meet_link: meetLink || null })
    .eq("id", coachId)
    .select("id");

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
