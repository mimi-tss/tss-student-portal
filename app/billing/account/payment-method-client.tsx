"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import styles from "../billing.module.css";

// A genuinely new client-side dependency for this repo (no prior
// Stripe.js/browser-SDK precedent existed) — Payment Element handles
// card entry entirely on Stripe's side; no card data ever passes through
// our own code. Each Stripe account has its own publishable key, so the
// key to load Stripe.js with comes back from the server alongside the
// SetupIntent's client_secret (app/api/billing/payment-method/setup-intent/route.ts)
// rather than being a static import-time constant.
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(publishableKey: string) {
  let promise = stripePromiseCache.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, promise);
  }
  return promise;
}

function CardForm({ email, onDone }: { email: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    // redirect: "if_required" avoids sending the student away for the
    // common case (a card that doesn't need 3DS) — confirmSetup only
    // navigates away when the payment method genuinely requires it.
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: `${window.location.origin}/billing/account` },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Couldn't save your card — try again.");
      setSubmitting(false);
      return;
    }
    if (!setupIntent) {
      setError("Couldn't save your card — try again.");
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/billing/payment-method/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupIntentId: setupIntent.id }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Card saved, but couldn't set it as default — contact the studio.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <PaymentElement options={{ defaultValues: { billingDetails: { email } } }} />
      {error && <p className={styles.errorText}>{error}</p>}
      <button type="submit" className={styles.cta} disabled={!stripe || submitting}>
        {submitting ? "Saving…" : "Save card"}
      </button>
    </form>
  );
}

export default function PaymentMethodClient({ onDone }: { onDone: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/payment-method/setup-intent", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.clientSecret || !data?.publishableKey) {
          setError("Couldn't start card setup — try again.");
          return;
        }
        setClientSecret(data.clientSecret);
        setPublishableKey(data.publishableKey);
        setEmail(data.email ?? "");
      })
      .catch(() => setError("Couldn't start card setup — try again."));
  }, []);

  if (error) return <p className={styles.errorText}>{error}</p>;
  if (!clientSecret || !publishableKey || email == null) return <p className={styles.helpText}>Loading…</p>;

  return (
    <div className={styles.card} style={{ maxWidth: 480, marginBottom: 16, textAlign: "left" }}>
      <Elements stripe={getStripePromise(publishableKey)} options={{ clientSecret }}>
        <CardForm email={email} onDone={onDone} />
      </Elements>
    </div>
  );
}
