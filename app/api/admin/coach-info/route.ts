import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Edits coaches.name/email/timezone/hidden_from_students/drive_folder_id — the fields
// AddCoachPanel sets once at provisioning and nothing since let admin
// correct. Not a money field, so isAdminRole (both admin and
// admin_finance), same as coach-active/coach-links. coaches.email is the
// actual login-lookup key (lib/auth/resolve-account.ts), not the
// Supabase auth user's email — updating it here is enough to fix a
// coach's login on its own.
export async function POST(req: NextRequest) {
  const { coachId, name, email, timezone, hiddenFromStudents, driveFolderId } = await req.json();

  if (!coachId || !name || !email || !timezone || typeof hiddenFromStudents !== "boolean") {
    return NextResponse.json(
      { error: "coachId, name, email, timezone, and hiddenFromStudents are required" },
      { status: 400 },
    );
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

  // driveFolderId is optional in the request shape (undefined leaves the
  // column untouched) so any future caller that doesn't send it can't
  // accidentally clear an already-set folder — only the edit form's
  // explicit blank ("") is treated as "clear it."
  const update: Record<string, unknown> = { name, email, timezone, hidden_from_students: hiddenFromStudents };
  if (driveFolderId !== undefined) update.drive_folder_id = driveFolderId || null;

  const { data: updated, error } = await supabase
    .from("coaches")
    .update(update)
    .eq("id", coachId)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Another coach already uses that email." }, { status: 409 });
    }
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
