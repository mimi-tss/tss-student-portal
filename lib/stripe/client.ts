import Stripe from "stripe";

// Server-only, lazily constructed — never import into a Client Component.
// A top-level `new Stripe(...)` at module scope broke `next build`: it
// throws immediately if STRIPE_SECRET_KEY is unset, and Next's build-time
// page-data collection loads every route module (including ones that
// only reference this on a request path that never runs during build),
// confirmed live via a real failed build. A Proxy defers construction to
// first actual property access, i.e. the first real API call at request
// time, when the env var is guaranteed to be present. Pinned apiVersion
// so a Stripe account-level API upgrade can't silently change this app's
// webhook payload shapes out from under it.
let cached: Stripe | null = null;
function getStripe(): Stripe {
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-08-26.dahlia" });
  }
  return cached;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});
