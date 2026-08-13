import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLinkToken, issueAndSendLoginLink } from "@/lib/auth/magic-link";
import { createAdminClient } from "@/lib/supabase/admin";

// Entry point for the link emailed to the student (see
// lib/auth/magic-link.ts). Verifies our own signed/single-use token, then
// hands off to Supabase's own magic-link flow to actually create the
// session cookie — we don't hand-roll session creation ourselves.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
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
