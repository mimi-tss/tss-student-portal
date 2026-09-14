import { Suspense } from "react";
import Link from "next/link";
import PricingClient from "./pricing-client";
import styles from "./billing.module.css";

export default function BillingPricingPage() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Choose your plan</h1>
      <p className={styles.subtitle}>
        Already a student? <Link href="/billing/login" className={styles.linkBtn}>Log in to manage your billing</Link>
      </p>
      {/* PricingClient reads ?tier= via useSearchParams (deep-link support
          for external landing pages) — App Router requires a Suspense
          boundary around any client component using that hook. */}
      <Suspense fallback={null}>
        <PricingClient />
      </Suspense>
    </div>
  );
}
