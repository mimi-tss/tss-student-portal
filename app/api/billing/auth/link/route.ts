import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLinkToken } from "@/lib/auth/magic-link";
import { issueAndSendBillingWelcomeLink } from "@/lib/auth/billing-welcome-link";
import { createAdminClient } from "@/lib/supabase/admin";

// Entry point for the welcome link emailed after a fresh Stripe signup
// (lib/auth/billing-welcome-link.ts). Same GET-renders-a-confirmation-
// page-then-POST-consumes-the-token shape as
// app/api/auth/kajabi/login/route.ts, and for the same reason: a bare GET
// that immediately consumed the token was confirmed live to cause a
// self-sustaining email loop with mail-scanner prefetching (see that
// route's own header comment) — a scanner fetches this GET page's HTML,
// it doesn't submit forms.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/billing/login?error=missing_token", req.url));
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
    <p>Tap below to access your billing account.</p>
    <form method="POST" action="/api/billing/auth/link">
      <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" />
      <button type="submit">Access my account</button>
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
    return NextResponse.redirect(new URL("/billing/login?error=missing_token", req.url));
  }

  const studentId = await consumeMagicLinkToken(token);
  if (!studentId) {
    return NextResponse.redirect(new URL("/billing/login?error=expired_link", req.url));
  }

  const admin = createAdminClient();
  const { data: student, error } = await admin.from("students").select("id, email").eq("id", studentId).single();

  if (error || !student) {
    return NextResponse.redirect(new URL("/billing/login?error=student_not_found", req.url));
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: student.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_BILLING_URL}/auth/callback?redirect_to=/billing/account&error_redirect=/billing/login`,
    },
  });

  if (linkError || !linkData) {
    return NextResponse.redirect(new URL("/billing/login?error=session_failed", req.url));
  }

  // Rotate now, same reasoning as the Kajabi link's own rotate-on-use —
  // the *next* visit to this welcome link is instant too, rather than
  // dead the moment it's used once.
  issueAndSendBillingWelcomeLink(student.id, student.email).catch((err) =>
    console.error("Failed to send rotated billing welcome link", err),
  );

  return NextResponse.redirect(linkData.properties.action_link);
}
