import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

  // The code already proved it's really them — mint a verifiable token the
  // same way the coach/admin provisioning flows do (generateLink), but
  // redeem it right here on the server via verifyOtp(token_hash) instead
  // of sending the client to Supabase's action_link and back through
  // /auth/callback. That link-then-callback path relies on a client-side
  // setSession() call (document.cookie, not a Set-Cookie header) after a
  // real cross-origin hop through Supabase's own domain — inside the
  // Kajabi iframe (portal.tarasimonstudios.com framed by
  // app.tarasimonstudios.com) Safari's ITP was blocking that JS-written
  // cookie, so the session never stuck and the user bounced straight back
  // to /login?error=not_logged_in. Redeeming the token here instead sets
  // the session via a real Set-Cookie response header on this same-origin
  // request — no client-side cookie write, no bounce through a third
  // domain, nothing for Safari's cross-iframe cookie blocking to catch.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
  });

  if (linkError || !linkData) {
    return NextResponse.json({ error: "Something went wrong creating your session — try again." }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json({ error: "Something went wrong creating your session — try again." }, { status: 500 });
  }

  // Fire-and-forget, not awaited — a failed log write shouldn't hold up
  // the response or fail an otherwise-successful login.
  if (verifyData.user) {
    supabase
      .from("activity_events")
      .insert({ event_type: "login", actor_id: verifyData.user.id, method: "login_code" })
      .then(({ error: logError }) => {
        if (logError) console.error("login event log failed", logError);
      });
  }

  return NextResponse.json({ redirectUrl: account.redirectPath });
}
