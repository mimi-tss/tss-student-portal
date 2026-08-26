import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Manual show/hide, independent of the Drive sync — lets admin hide
// something from the catalog without touching the source file in Drive.
// A later sync won't un-hide it unless the file still exists in the
// folder AND the row was inactive only because it fell out of sync
// (this route's manual hides and a sync's "file removed" deactivation
// share the same `active` flag, which is an acceptable simplification —
// re-running sync after a manual hide will re-activate it if the file's
// still in Drive, same as any other present file).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { active } = await req.json();
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "active (boolean) required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("exercises").update({ active }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
