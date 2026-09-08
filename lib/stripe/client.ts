import Stripe from "stripe";
import type { StripeAccount } from "@/types/database";

// Server-only, lazily constructed — never import into a Client Component.
// A top-level `new Stripe(...)` at module scope broke `next build`: it
// throws immediately if the secret key is unset, and Next's build-time
// page-data collection loads every route module (including ones that
// only reference this on a request path that never runs during build),
// confirmed live via a real failed build. A Proxy defers construction to
// first actual property access, i.e. the first real API call at request
// time, when the env var is guaranteed to be present. Pinned apiVersion
// so a Stripe account-level API upgrade can't silently change this app's
// webhook payload shapes out from under it — same pin on both accounts.
const API_VERSION = "2026-08-26.dahlia";

function makeLazyClient(envVar: string): Stripe {
  let cached: Stripe | null = null;
  function get(): Stripe {
    if (!cached) {
      cached = new Stripe(process.env[envVar]!, { apiVersion: API_VERSION });
    }
    return cached;
  }
  return new Proxy({} as Stripe, {
    get(_target, prop, receiver) {
      return Reflect.get(get(), prop, receiver);
    },
  });
}

// The current account — all new signups (app/api/billing/checkout) go
// here, and it's what the rest of the pre-dual-account billing build
// already used before the studio's legacy "Opus" account entered the
// picture.
export const stripe = makeLazyClient("STRIPE_SECRET_KEY");

// The legacy account — pre-migration customers only, never new signups.
export const stripeOpus = makeLazyClient("OPUS_STRIPE_SECRET_KEY");

export function getStripeClient(account: StripeAccount): Stripe {
  return account === "opus" ? stripeOpus : stripe;
}
