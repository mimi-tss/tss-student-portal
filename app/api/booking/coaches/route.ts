import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lists all coaches — used by the trial-lesson coach picker, since a
// fresh Suite student can pick any coach for their one trial (section 5),
// not just an assigned_coach_id they may not have yet.
export async function GET() {
  const supabase = await createClient();

  const { data: coaches } = await supabase
    .from("coaches")
    .select("id, name")
    .order("name");

  return NextResponse.json({ coaches: coaches ?? [] });
}
