import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLinkToken, issueAndSendLoginLink } from "@/lib/auth/magic-link";
import { createAdminClient } from "@/lib/supabase/admin";

// Entry point for the link emailed to the student (see
// lib/auth/magic-link.ts). Verifies our own signed/single-use token, then
// hands off to Supabase's own magic-link flow to actually create the
// session cookie — we don't hand-roll session creation ourselves.
//
// GET used to do all of this directly — confirmed live this is exactly
// what caused a real, ongoing email loop for a student: many email
// providers/corporate mail scanners automatically fetch every link in
// an incoming email to check for phishing, BEFORE a human ever opens
// it. Since a GET hit consumed the token and (per the rotate-on-use
// comment below) immediately emailed a fresh replacement, an automated
// scan consumed the link, triggering a new email, which then got
// scanned too — a self-sustaining loop, roughly every time the
// scanner's own retry/batch interval fired, with no human involved at
// all. GET now only ever renders a plain confirmation page — nothing
// stateful happens until the real click below submits the POST form. A
// scanner fetches the GET page's HTML; it doesn't submit forms.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  return new NextResponse(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tara Simon Studios</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #101018; color: #f4f0e6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { text-align: center; padding: 32px; }
  button { background: #a78bfa; color: #241a3d; border: none; border-radius: 10px; padding: 14px 28px; font-size: 16px; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
  <div class="card">
    <p>Tap below to open your coaching portal.</p>
    <form method="POST" action="/api/auth/kajabi/login">
      <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" />
      <button type="submit">Open my portal</button>
    </form>
  </div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = form.get("token");
  if (typeof token !== "string" || !token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  const studentId = await consumeMagicLinkToken(token);
  if (!studentId) {
    return NextResponse.redirect(new URL("/login?error=expired_link", req.url));
  }

  const admin = createAdminClient();

  const { data: student, error } = await admin
    .from("students")
    .select("id, email")
    .eq("id", studentId)
    .single();

  if (error || !student) {
    return NextResponse.redirect(new URL("/login?error=student_not_found", req.url));
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: student.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=/student/dashboard`,
    },
  });

  if (linkError || !linkData) {
    return NextResponse.redirect(new URL("/login?error=session_failed", req.url));
  }

  // Rotate now and email the fresh link, so the *next* login is instant too.
  issueAndSendLoginLink(student.id, student.email).catch((err) =>
    console.error("Failed to send rotated login link", err),
  );

  return NextResponse.redirect(linkData.properties.action_link);
}
