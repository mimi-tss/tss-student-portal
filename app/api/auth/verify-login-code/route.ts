import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccountByEmail } from "@/lib/auth/resolve-account";
import { verifyLoginCode } from "@/lib/auth/login-code";

// Step 2 — the code was already proven correct for this email by the
// time this runs, so unlike request-login-code this can be specific
// about failures (wrong/expired code) without leaking anything new: the
// caller already knows the email they typed in step 1.
export async function POST(req: NextRequest) {
  const { email, code } = await req.json();
  if (typeof email !== "string" || typeof code !== "string" || !email.trim() || !code.trim()) {
    return NextResponse.json({ error: "email and code required" }, { status: 400 });
  }

  const ok = await verifyLoginCode(email, code.trim());
  if (!ok) {
    return NextResponse.json({ error: "That code is wrong or has expired — request a new one." }, { status: 401 });
  }

  const admin = createAdminClient();
  const account = await resolveAccountByEmail(admin, email);
  if (!account) {
    // Shouldn't happen — a code can't exist for an email
    // request-login-code refused to send one for — but handled rather
    // than assumed.
    return NextResponse.json({ error: "We couldn't find your account." }, { status: 404 });
  }

  // The code already proved it's really them — this generates the same
  // kind of Supabase-native magic link the coach/admin provisioning
  // flows already use, just returned to the client instead of emailed,
  // since the client already has what it needs to navigate there itself.
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=${account.redirectPath}`,
    },
  });

  if (error || !linkData) {
    return NextResponse.json({ error: "Something went wrong creating your session — try again." }, { status: 500 });
  }

  return NextResponse.json({ redirectUrl: linkData.properties.action_link });
}
