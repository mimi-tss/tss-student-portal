"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Supabase's magic-link verification (/auth/v1/verify) delivers the
// session as a URL *fragment* (#access_token=...), not a ?code= query
// param — fragments never reach the server, so this can't be a server
// route handler.
//
// @supabase/ssr's createBrowserClient also hardcodes flowType: "pkce",
// so its own automatic detectSessionInUrl only ever looks for a ?code=
// param and silently ignores a hash fragment — confirmed by testing a
// real login, not assumed. So this parses the fragment by hand and calls
// setSession() directly, which persists to cookies regardless of
// flowType (flowType only gates the client's own auto-detection, not a
// manual setSession call).
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const redirectTo = searchParams.get("redirect_to") ?? "/student/dashboard";
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hashParams.get("access_token");
    const refresh_token = hashParams.get("refresh_token");

    if (!access_token || !refresh_token) {
      router.replace("/login?error=session_failed");
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => {
      // Fire-and-forget, not awaited before the redirect — same detached
      // pattern as issueAndSendLoginLink in the Kajabi login route. A
      // failed log write shouldn't block or delay signing the user in.
      if (!error && data.session?.user) {
        supabase
          .from("activity_events")
          .insert({ event_type: "login", actor_id: data.session.user.id, method: "magic_link" })
          .then(({ error: logError }) => {
            if (logError) console.error("login event log failed", logError);
          });
      }
      router.replace(error ? "/login?error=session_failed" : redirectTo);
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
