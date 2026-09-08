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
      <PricingClient />
    </div>
  );
}
