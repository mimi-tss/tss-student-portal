import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncExercisesFromDrive } from "@/lib/exercises";

// Pulls the current file list from the studio's shared exercises Drive
// folder and reconciles the `exercises` catalog against it (see
// lib/exercises.ts for the add/deactivate logic). Admin-only, confirmed
// via the session-scoped client before touching anything — the sync
// itself needs the service-role client internally (bulk upserts), same
// posture as other admin routes that mix session-scoped auth checks with
// service-role writes.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const folderId = process.env.GOOGLE_EXERCISES_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: "GOOGLE_EXERCISES_FOLDER_ID not configured" }, { status: 500 });
  }

  try {
    const result = await syncExercisesFromDrive(folderId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}
