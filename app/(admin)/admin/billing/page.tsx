import { createClient } from "@/lib/supabase/server";
import BillingClient from "./billing-client";
import styles from "../../admin.module.css";

// Open to every admin (not financeOnly like Finance/Reports) — matches
// Needs Review already surfacing cancellations to everyone; this is
// student-account/billing management, not pay-rate/margin reporting.
export default async function AdminBillingPage() {
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, name, tier, subscription_status, payment_status, billing_anniversary_date, stripe_customer_id, stripe_price_id")
    .not("stripe_customer_id", "is", null)
    .order("name");

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Billing</h1>
      <BillingClient students={students ?? []} />
    </main>
  );
}
