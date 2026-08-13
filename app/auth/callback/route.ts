import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Standard Supabase SSR PKCE callback: exchanges the `code` Supabase's
// magic-link verify step hands back for an actual session cookie, then
// continues on to wherever the login flow was headed.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const redirectTo = req.nextUrl.searchParams.get("redirect_to") ?? "/student/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(redirectTo, req.url));
}
