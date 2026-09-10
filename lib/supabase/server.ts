import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// Server-side Supabase client, for use in Server Components, route handlers,
// and server actions. Reads/writes the auth cookie via Next's cookies() API.
//
// The session cookie is shared across every *.tarasimonstudios.com
// subdomain (portal, billing, any future one) via a leading-dot Domain
// attribute — confirmed this is what the user actually wants: "like
// Spotify... if I'm logged into Spotify on web browser, I can open
// billing, it just opens a new tab" with no separate re-login. Guarded
// to only apply when actually served from that real domain — a browser
// silently refuses to set a cookie whose Domain doesn't match the
// current host (or a parent of it), so applying this on localhost or a
// Vercel preview URL would break auth there entirely, not just skip the
// sharing. billing.tarasimonstudios.com keeps its own separate
// login-code flow as a fallback for anyone who lands there without an
// existing portal.* session (a legacy Opus customer who's never used
// the main app, a different browser/device) — this only changes whether
// an *already-authenticated* visit needs it again.
export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "";
  const cookieDomain = host.endsWith("tarasimonstudios.com") ? ".tarasimonstudios.com" : undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(cookieDomain ? { cookieOptions: { domain: cookieDomain } } : {}),
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
