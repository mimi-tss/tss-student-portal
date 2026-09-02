import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveFolderAccess } from "@/lib/shared-folder";
import { listStudentRecordings } from "@/lib/google/drive";

// Lists a student's shared folder — split out from every page that
// renders SharedFolderPanel so the Drive listing (the slowest call this
// app makes) happens on its own, client-side, instead of being baked
// into each page's server render. Before this, every action on the
// admin student-detail page that called router.refresh() (Cancel,
// Reassign coach, Add/Edit/Delete credit, change schedule, all 8
// subscription-lifecycle actions, etc.) re-ran that Drive call too, even
// though almost none of those actions touch recordings — same story on
// the coach and student dashboards.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  const { allowed, folderId } = await resolveFolderAccess(supabase, user.id, studentId);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!folderId) return NextResponse.json({ files: [] });

  const files = await listStudentRecordings(folderId);
  return NextResponse.json({ files });
}
