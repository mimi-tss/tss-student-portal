import { NextResponse, type NextRequest } from "next/server";

// Purges a leftover Supabase auth cookie left over from a ~4-hour
// window on 2026-09-10 that briefly set it with `Domain=.tarasimonstudios.com`
// (commit 3229ba3, reverted by 49819e9) instead of today's normal
// host-only cookie. A browser that visited during that window still
// holds BOTH — same name, different Domain — and sends both on every
// request from then on; which one a server-side reader resolves to is
// effectively unpredictable, which is exactly an intermittent "logged
// in, then immediately bounced back to /login" symptom (confirmed live
// against Celine's account, three separate times).
//
// A first attempt at this (lib/supabase/server.ts, commit b5863e4)
// called cookieStore.set() on the SAME cookie name Supabase's own
// client was about to read via cookies(), before it ever read it. Next's
// cookies() store keys its internal Map by name only — no Domain
// awareness — so that call clobbered the CURRENT, valid, host-only
// cookie's own value for the rest of the request, breaking auth for
// EVERYONE, confirmed and reverted within minutes (b5863e4 -> 1d824b0).
//
// This version can't repeat that failure by construction, not just by
// being more careful: middleware only ever touches the OUTGOING
// NextResponse it returns — it has no way to affect what THIS request's
// own Server Components/Route Handlers see when THEY separately call
// cookies() moments later, since that reads the ORIGINAL incoming
// request, untouched. And unlike cookies().set() (which collapses
// same-name writes to one Map entry — confirmed by reading its actual
// source, @edge-runtime/cookies), appending directly to the Headers
// object is verified (tested in isolation before shipping this) to
// preserve two independent `Set-Cookie` lines for the same cookie name
// with different Domain attributes — genuinely additive, never
// overwriting whatever the route itself already set.
//
// Only emits the extra header for cookie names actually present on the
// incoming request and only on the real domain — a total no-op for
// anyone who was never affected, and for localhost/preview URLs (a
// browser silently refuses to set a cookie whose Domain doesn't match
// the current host anyway). Safe to delete once confident every
// affected browser has visited at least once since this shipped.
const STALE_COOKIE_DOMAIN = ".tarasimonstudios.com";
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

export function middleware(req: NextRequest) {
  const response = NextResponse.next();

  const host = req.headers.get("host") ?? "";
  if (!host.endsWith("tarasimonstudios.com")) return response;

  for (const { name } of req.cookies.getAll()) {
    if (AUTH_COOKIE_PATTERN.test(name)) {
      response.headers.append(
        "Set-Cookie",
        `${name}=; Domain=${STALE_COOKIE_DOMAIN}; Path=/; Max-Age=0; Secure; SameSite=Lax`,
      );
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
