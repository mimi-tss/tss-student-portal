import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// A ~4-hour window earlier today (2026-09-10) briefly set this same auth
// cookie with `Domain=.tarasimonstudios.com` (commit 3229ba3, reverted by
// 49819e9) — anyone who logged in or had their token silently refreshed
// during that window still has that domain-scoped copy sitting in their
// browser today, alongside the host-only cookie every request sets now.
// A browser sends BOTH same-named cookies on every request from then on,
// and which one a server-side cookie parser resolves to is effectively
// unpredictable (RFC 6265's path/creation-time sort, inconsistently
// implemented) — exactly an intermittent "logged in, then immediately
// bounced back to /login" symptom for returning visitors specifically
// (confirmed live: Celine hit it repeatedly in her regular browser, but
// it disappeared entirely in a fresh incognito window with no stale
// cookie to collide with). Fresh visitors, and anyone who never used the
// app during that window, are unaffected either way.
// Purges the leftover copy explicitly rather than waiting for it to
// expire on its own — a plain host-only Set-Cookie can't delete a
// Domain-scoped cookie of the same name, so this is a real Set-Cookie
// aimed at the SAME domain the stale copy was actually written under.
// Only fires where cookies were ever domain-scoped in the first place
// (matches the original guard); a total no-op for anyone who doesn't
// actually have that stale cookie. Safe to remove once confident every
// affected browser has revisited at least once since this shipped.
const STALE_COOKIE_DOMAIN = ".tarasimonstudios.com";
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

// Server-side Supabase client, for use in Server Components, route handlers,
// and server actions. Reads/writes the auth cookie via Next's cookies() API.
export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "";

  if (host.endsWith("tarasimonstudios.com")) {
    try {
      for (const { name } of cookieStore.getAll()) {
        if (AUTH_COOKIE_PATTERN.test(name)) {
          cookieStore.set(name, "", { domain: STALE_COOKIE_DOMAIN, path: "/", maxAge: 0 });
        }
      }
    } catch {
      // Called from a Server Component render, where cookies() can only
      // be read, not written — same restriction setAll's own try/catch
      // below already works around. Skipped here; the next request that
      // does go through a route handler or server action catches it.
    }
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component; safe to ignore
            // when middleware is refreshing the session.
          }
        },
      },
    },
  );
}
