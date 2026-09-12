import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyLoginCode } from "@/lib/auth/login-code";

// A same-site `/billing/*` path only — never anything else. This value
// comes straight from a request body, so treating it as a trusted
// redirect target without this check would be an open redirect (e.g.
// "//evil.com" or "https://evil.com" both fail the startsWith/no-"//"
// checks below).
function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/billing/") || next.startsWith("//") || next.includes("://")) {
    return null;
  }
  return next;
}

// Billing-site equivalent of app/api/auth/verify-login-code — same
// server-side generateLink()+verifyOtp() session-set pattern (robust
// regardless of iframe; this site is never iframed but there's no reason
// to use a weaker client-side flow here either). Redirects to whichever
// /billing/* page the student actually meant to reach (see
// login-form.tsx's own `next`), defaulting to /billing/account.
export async function POST(req: NextRequest) {
  const { email, code, next } = await req.json();
  if (typeof email !== "string" || typeof code !== "string" || !email.trim() || !code.trim()) {
    return NextResponse.json({ error: "email and code required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const ok = await verifyLoginCode(normalizedEmail, code.trim());
  if (!ok) {
    return NextResponse.json({ error: "That code is wrong or has expired — request a new one." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (linkError || !linkData) {
    return NextResponse.json({ error: "Something went wrong creating your session — try again." }, { status: 500 });
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json({ error: "Something went wrong creating your session — try again." }, { status: 500 });
  }

  return NextResponse.json({ redirectUrl: safeNextPath(next) ?? "/billing/account" });
}
