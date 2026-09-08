import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueAndSendLoginCode } from "@/lib/auth/login-code";

// Billing-site equivalent of app/api/auth/request-login-code — but the
// billing site only ever serves students (no coach/admin path exists
// there), so this looks up `students` directly instead of going through
// resolveAccountByEmail (which also matches coaches/admin and would
// point them at /coach or /admin, neither of which exist on this host).
//
// Unlike the main app's login, a billing visitor who has no account yet
// is a real, expected case (a brand-new prospective student typing their
// email on /billing/login) — told to check out instead, rather than
// getting the same generic "check your email" response an unmatched
// email gets everywhere else in this app (that no-enumeration posture
// makes sense for staff-only login pages; it's just friction here).
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: student } = await admin
    .from("students")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (!student) {
    return NextResponse.json(
      { error: "no_account", message: "We couldn't find an account with that email — start with checkout instead." },
      { status: 404 },
    );
  }

  await issueAndSendLoginCode(normalizedEmail);
  return NextResponse.json({ success: true });
}
