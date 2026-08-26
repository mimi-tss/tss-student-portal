import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveFolderAccess } from "@/lib/shared-folder";
import { parseDriveFileId, createDriveShortcut } from "@/lib/google/drive";

// "Paste a Google Drive link" quick-add — instantly adds it as a
// shortcut in the student's shared folder rather than requiring the
// coach to dig through Drive folders manually.
export async function POST(req: NextRequest) {
  const { studentId, driveLink } = await req.json();
  if (!studentId || !driveLink) {
    return NextResponse.json({ error: "studentId and driveLink required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { allowed, folderId } = await resolveFolderAccess(supabase, user.id, studentId);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!folderId) return NextResponse.json({ error: "no shared folder yet" }, { status: 404 });

  const targetId = parseDriveFileId(driveLink);
  if (!targetId) {
    return NextResponse.json({ error: "couldn't read a Drive file id from that link" }, { status: 400 });
  }

  try {
    const shortcut = await createDriveShortcut(folderId, targetId);
    return NextResponse.json({ success: true, file: shortcut });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't add that link" },
      { status: 500 },
    );
  }
}
