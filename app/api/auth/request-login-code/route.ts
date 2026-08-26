import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccountByEmail } from "@/lib/auth/resolve-account";
import { issueAndSendLoginCode } from "@/lib/auth/login-code";

// Step 1 of the /login page's email-then-code flow. Public/
// unauthenticated by necessity. Used to stay silent either way (no
// enumeration) — deliberately reversed per your call: this is a small,
// invite-only studio roster, not a public consumer app, and "stuck on
// the code page waiting for an email that'll never come, with no
// explanation" was the worse real-world failure mode. A genuine send
// failure (the account IS real, the code just didn't go out) still
// falls through to the generic success response below — only "no
// account for this email at all" gets the explicit message, since
// that's the one case a delivery-layer error can't be confused with.
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const account = await resolveAccountByEmail(admin, email);
  if (!account) {
    return NextResponse.json(
      { error: "You don't have permission to enter this studio. Please contact admin at info@tarasimonstudios.com." },
      { status: 404 },
    );
  }

  try {
    await issueAndSendLoginCode(account.email);
  } catch (err) {
    console.error("request-login-code failed", err);
    // Still falls through to the generic response — a delivery failure
    // for a real account shouldn't say "you're not registered".
  }

  return NextResponse.json({ success: true });
}
