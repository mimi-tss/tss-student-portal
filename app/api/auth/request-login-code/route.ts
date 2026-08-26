import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccountByEmail } from "@/lib/auth/resolve-account";
import { issueAndSendLoginCode } from "@/lib/auth/login-code";

// Step 1 of the /login page's email-then-code flow. Public/
// unauthenticated by necessity, so it always returns the same generic
// response regardless of whether the email matched anything — same
// no-enumeration reasoning as the link-based flow it replaces.
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const account = await resolveAccountByEmail(admin, email);
    if (account) {
      await issueAndSendLoginCode(account.email);
    }
  } catch (err) {
    console.error("request-login-code failed", err);
    // Still falls through to the generic response — a delivery failure
    // shouldn't reveal anything either.
  }

  return NextResponse.json({ success: true });
}
