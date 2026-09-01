import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin corrects a session credit's expiry date after the fact (a typo'd
// date on grant, or extending one manually). RLS ("admins can update all
// makeup credits", 0060) already permits this — no new policy needed,
// unlike delete (see 0081). Scoped to unused credits only: an already-
// redeemed one is real history tied to whatever session consumed it, not
// something an expiry-date edit should touch.
export async function POST(req: NextRequest) {
  const { creditId, expiresAt } = await req.json();

  if (!creditId || !expiresAt) {
    return NextResponse.json({ error: "creditId and expiresAt are required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from("makeup_credits")
    .update({ expires_at: expiresAt }, { count: "exact" })
    .eq("id", creditId)
    .eq("used", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // RLS silently filters rows the caller isn't scoped to rather than
  // erroring — a 0-row update means "not found, already used, or not
  // yours", not success.
  if (!count) {
    return NextResponse.json({ error: "Credit not found or already used." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
