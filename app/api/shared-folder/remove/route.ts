import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveFolderAccess } from "@/lib/shared-folder";
import { removeStudentFolderItem } from "@/lib/google/drive";

export async function POST(req: NextRequest) {
  const { studentId, fileId } = await req.json();
  if (!studentId || !fileId) {
    return NextResponse.json({ error: "studentId and fileId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { allowed, folderId } = await resolveFolderAccess(supabase, user.id, studentId);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!folderId) return NextResponse.json({ error: "no shared folder" }, { status: 404 });

  try {
    await removeStudentFolderItem(folderId, fileId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't remove that item" },
      { status: 500 },
    );
  }
}
