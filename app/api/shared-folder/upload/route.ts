import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveFolderAccess } from "@/lib/shared-folder";
import { uploadToStudentFolder } from "@/lib/google/drive";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

// Shared folder — student, their coach, or admin can all upload directly
// into the same per-student Drive folder recordings already live in.
// Access resolved server-side, never trusted from the client.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const studentId = formData.get("studentId");
  if (!(file instanceof File) || typeof studentId !== "string") {
    return NextResponse.json({ error: "file and studentId required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "file too large (50MB max)" }, { status: 400 });
  }

  const { allowed, folderId } = await resolveFolderAccess(supabase, user.id, studentId);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!folderId) return NextResponse.json({ error: "no shared folder yet" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const uploaded = await uploadToStudentFolder(folderId, {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });
    return NextResponse.json({ success: true, file: uploaded });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload failed" },
      { status: 500 },
    );
  }
}
