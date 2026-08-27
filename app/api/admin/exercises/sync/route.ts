import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncExercisesFromDrive } from "@/lib/exercises";
import { isAdminRole } from "@/lib/auth/roles";

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

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  // Trimmed defensively — a stray trailing space/newline from a
  // copy-paste into Vercel's env var UI is a real, easy-to-hit mistake
  // and Drive's API error for a mangled id ("File not found: <id>.")
  // doesn't make the cause obvious.
  const folderId = process.env.GOOGLE_EXERCISES_FOLDER_ID?.trim();
  if (!folderId) {
    return NextResponse.json({ error: "GOOGLE_EXERCISES_FOLDER_ID not configured" }, { status: 500 });
  }

  // TEMP DEBUG (2026-08-27): "File not found: ." keeps coming back blank
  // regardless of folder id / credential fixes — surfacing the actual
  // runtime values (masked, no secrets) directly in the error response so
  // we don't have to guess. Revert once root cause is found.
  const debug = {
    folderIdLength: folderId.length,
    folderIdSnippet: folderId.length > 8 ? `${folderId.slice(0, 4)}...${folderId.slice(-4)}` : folderId,
    serviceAccountEmailSet: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    serviceAccountEmailSnippet: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.slice(0, 6),
    privateKeyLength: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.length ?? 0,
    privateKeyStartsCorrect: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim().startsWith("-----BEGIN"),
    adminEmailSet: !!process.env.GOOGLE_ADMIN_EMAIL,
  };

  try {
    const result = await syncExercisesFromDrive(folderId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "sync failed",
        debug,
        errDetail: err instanceof Error ? { name: err.name, code: (err as { code?: unknown }).code, errors: (err as { errors?: unknown }).errors } : String(err),
      },
      { status: 500 },
    );
  }
}
