import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exercises library catalog (TSS_App_Spec_1.md section 8 admin bullet:
// "add/edit the mp3 catalog coaches assign from") — now synced from a
// shared Drive folder the studio manages by hand rather than uploaded
// through this app (see app/api/admin/exercises/sync). This route is
// just the read side; RLS ("admins can manage exercises", 0024) covers
// authorization.
export async function GET() {
  const supabase = await createClient();
  const { data: exercises, error } = await supabase
    .from("exercises")
    .select("id, title, description, category, active, created_at")
    .order("active", { ascending: false })
    .order("title");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ exercises: exercises ?? [] });
}
