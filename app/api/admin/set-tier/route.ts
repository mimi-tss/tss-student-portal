import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_TIERS = ["lite", "suite", "pro", "elite"];

// Manual admin override of a student's membership tier — normally this
// column is only ever written by the Kajabi webhook's purchase.created
// handler (app/api/webhooks/kajabi/route.ts). A blind update, same as
// that webhook's own upsert, so it's a stopgap rather than a lock: the
// next real Kajabi purchase/upgrade event overwrites it again exactly as
// if this override never happened.
export async function POST(req: NextRequest) {
  const { studentId, tier } = await req.json();

  if (!studentId || !VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: "studentId and a valid tier required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").update({ tier }).eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
