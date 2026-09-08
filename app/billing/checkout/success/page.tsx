import { stripe } from "@/lib/stripe/client";
import { TIER_LABEL } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";
import styles from "../../billing.module.css";

// Doesn't write to the DB — the webhook (app/api/webhooks/stripe/route.ts)
// is the sole writer, avoiding a race between this page rendering and the
// webhook actually landing. This only reads the session back, purely to
// display an optimistic confirmation.
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  let tier: Tier | null = null;
  let email: string | null = null;

  if (session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      tier = (session.metadata?.tier as Tier) ?? null;
      email = session.customer_details?.email ?? session.customer_email ?? null;
    } catch {
      // Fine — the page still shows a sensible fallback below.
    }
  }

  return (
    <div className={styles.centerCard}>
      <div className={styles.card}>
        <h1 className={styles.title} style={{ fontSize: 22 }}>
          You&apos;re in{tier ? ` — ${TIER_LABEL[tier]}` : ""}!
        </h1>
        <p className={styles.helpText}>
          {email
            ? `Check ${email} for a link to access your account — no password needed.`
            : "Check your email for a link to access your account — no password needed."}
        </p>
      </div>
    </div>
  );
}
