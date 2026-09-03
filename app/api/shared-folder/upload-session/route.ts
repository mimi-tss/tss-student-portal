import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveFolderAccess } from "@/lib/shared-folder";
import { createResumableUploadSession } from "@/lib/google/drive";

// Step 1 of the shared-folder upload: mints a Drive resumable-upload
// session URL and hands it back to the browser, which PUTs the file
// bytes straight to Google from there (see createResumableUploadSession's
// own comment for why — no file bytes, and no size ceiling, pass through
// this server at all). Access resolved server-side exactly like the old
// buffered route did, never trusted from the client.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { studentId, fileName, mimeType } = await req.json();
  if (!studentId || !fileName) {
    return NextResponse.json({ error: "studentId and fileName required" }, { status: 400 });
  }

  const { allowed, folderId } = await resolveFolderAccess(supabase, user.id, studentId);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!folderId) return NextResponse.json({ error: "no shared folder yet" }, { status: 404 });

  try {
    const uploadUrl = await createResumableUploadSession(folderId, {
      name: fileName,
      mimeType: mimeType || "application/octet-stream",
    });
    return NextResponse.json({ uploadUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not start the upload" },
      { status: 500 },
    );
  }
}
