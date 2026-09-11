"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Tier } from "@/types/database";
import { TIER_LABEL } from "@/lib/stripe/tiers";
import styles from "../billing.module.css";

// Same Stripe.js loading pattern as payment-method-client.tsx (own
// module-scoped cache, since re-calling loadStripe with the same key
// creates a fresh instance every time otherwise). Always the CURRENT
// account's publishable key here — the whole point of this flow is
// collecting a card that ISN'T on Opus.
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(publishableKey: string) {
  let promise = stripePromiseCache.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, promise);
  }
  return promise;
}

function CardForm({
  tier,
  interval,
  ownCustomerId,
  email,
  onDone,
}: {
  tier: Tier;
  interval: "monthly" | "yearly";
  ownCustomerId: string;
  email: string;
  onDone: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: `${window.location.origin}/billing/account` },
      redirect: "if_required",
    });

    if (confirmError || !setupIntent) {
      setError(confirmError?.message ?? "Couldn't save your card — try again.");
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/billing/migrate/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, interval, ownCustomerId, setupIntentId: setupIntent.id }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Card saved, but the plan switch failed — contact the studio.");
      return;
    }
    onDone(
      `You're all set on ${TIER_LABEL[tier]} — your new billing starts when your current billing period ends, so you won't be charged twice.`,
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <PaymentElement options={{ defaultValues: { billingDetails: { email } } }} />
      {error && <p className={styles.errorText}>{error}</p>}
      <button type="submit" className={styles.cta} disabled={!stripe || submitting}>
        {submitting ? "Switching…" : "Save card & switch plan"}
      </button>
    </form>
  );
}

// Opus→own migration, step 2 (see .../migrate/setup-intent and
// .../migrate/complete). Shown instead of the plain reason-and-submit
// form for an Opus-linked student — they need a new card on the current
// account before anything else, since Opus's saved card belongs to a
// different Stripe account entirely and can't just be reused.
export default function MigrateCardForm({
  tier,
  interval,
  onDone,
}: {
  tier: Tier;
  interval: "monthly" | "yearly";
  onDone: (message: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [ownCustomerId, setOwnCustomerId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/migrate/setup-intent", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.clientSecret || !data?.publishableKey || !data?.ownCustomerId) {
          setError("Couldn't start card setup — try again.");
          return;
        }
        setClientSecret(data.clientSecret);
        setPublishableKey(data.publishableKey);
        setOwnCustomerId(data.ownCustomerId);
        setEmail(data.email ?? "");
      })
      .catch(() => setError("Couldn't start card setup — try again."));
  }, []);

  if (error) return <p className={styles.errorText}>{error}</p>;
  if (!clientSecret || !publishableKey || !ownCustomerId || email == null) {
    return <p className={styles.helpText}>Setting up card entry…</p>;
  }

  return (
    <div className={`${styles.card} ${styles.form}`} style={{ maxWidth: 480, marginTop: 16, textAlign: "left" }}>
      <p className={styles.helpText} style={{ margin: 0 }}>
        You&apos;re on our legacy billing system — moving to <strong>{TIER_LABEL[tier]}</strong> needs a card on
        file here. Nothing is charged until your current period actually ends.
      </p>
      <Elements stripe={getStripePromise(publishableKey)} options={{ clientSecret }}>
        <CardForm tier={tier} interval={interval} ownCustomerId={ownCustomerId} email={email} onDone={onDone} />
      </Elements>
    </div>
  );
}
