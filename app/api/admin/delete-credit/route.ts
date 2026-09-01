import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin removes a wrongly-granted or duplicate session credit. Requires
// migration 0081 ("admins can delete makeup credits") — no delete policy
// existed on this table before that. Scoped to unused credits only, same
// reasoning as update-credit-expiry: a used one is real history tied to
// whatever session consumed it.
export async function POST(req: NextRequest) {
  const { creditId } = await req.json();

  if (!creditId) {
    return NextResponse.json({ error: "creditId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from("makeup_credits")
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
