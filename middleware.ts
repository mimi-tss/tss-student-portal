import { NextResponse, type NextRequest } from "next/server";

// Serves the billing subdomain (billing.tarasimonstudios.com) from this
// same deployment — a second Vercel domain attached to the same project,
// no separate repo/build. Everything under app/billing/... is a normal
// path; this just rewrites billing.* traffic to it so the subdomain's
// root ("/") lands on the pricing page instead of the main app.
//
// portal.tarasimonstudios.com (and any other host) falls through
// untouched. /api, /_next, and favicon.ico are excluded via the matcher
// below — billing's own API routes are called via relative fetch() from
// the already-rewritten pages and must reach their real /api/... file
// unmodified. /auth/callback is excluded too — it's a shared client
// page (handles the magic-link session hash for both hosts, see its own
// header comment) that must be reachable at the same top-level path
// regardless of which domain served it.
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("billing.")) {
    const url = req.nextUrl.clone();
    url.pathname = `/billing${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|auth/callback).*)"],
};
