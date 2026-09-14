import { Suspense } from "react";
import AddonsSelectClient from "./addons-select-client";
import styles from "../billing.module.css";

// Unauthenticated, like the main pricing page (app/billing/page.tsx) —
// this is a step BEFORE checkout, reached from an external landing
// page's CTA (e.g. singsmartersuitefunnel.txt: /billing/addons-select?
// tier=suite&interval=monthly) for someone with no account yet. Not
// the same page as app/billing/addons (that one requires login — it's
// for an EXISTING student managing what's already on their
// subscription). This page's "Continue" always works with zero
// add-ons selected — the add-ons step is a detour, never a gate.
export default function BillingAddonsSelectPage() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Add more coaching?</h1>
      <p className={styles.subtitle}>Optional — skip straight to checkout if you just want the base plan.</p>
      <Suspense fallback={null}>
        <AddonsSelectClient />
      </Suspense>
    </div>
  );
}
