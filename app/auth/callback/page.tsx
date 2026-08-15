"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Supabase's magic-link verification (/auth/v1/verify) delivers the
// session as a URL *fragment* (#access_token=...), not a ?code= query
// param — fragments never reach the server, so this can't be a server
// route handler. The browser Supabase client's default
// detectSessionInUrl behavior picks the fragment up on load and persists
// it into cookies (the whole point of @supabase/ssr's browser client,
// vs. plain supabase-js's localStorage-only default) — this page just
// waits for that, then redirects on.
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();
    const redirectTo = searchParams.get("redirect_to") ?? "/student/dashboard";

    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? redirectTo : "/login?error=session_failed");
    });
  }, [router, searchParams]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Signing you in…</p>
      <Suspense fallback={null}>
        <CallbackHandler />
      </Suspense>
    </main>
  );
}
