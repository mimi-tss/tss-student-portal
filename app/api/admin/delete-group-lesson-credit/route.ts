import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin removes a wrongly-granted or duplicate group-lesson credit — same
// posture as delete-credit/route.ts for makeup_credits, just the group
// lesson counterpart (migration 0086's own "admins can manage group
// lesson credits" policy already covers delete, no separate migration
// needed the way makeup_credits required 0081). Scoped to unused credits
// only: a used one is real history tied to whatever class consumed it.
export async function POST(req: NextRequest) {
  const { creditId } = await req.json();

  if (!creditId) {
    return NextResponse.json({ error: "creditId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from("group_lesson_credits")
    .delete({ count: "exact" })
    .eq("id", creditId)
    .eq("used", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Credit not found or already used." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
