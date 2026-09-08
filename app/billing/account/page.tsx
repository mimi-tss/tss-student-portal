import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { renewalInfo } from "@/lib/billing/renewal";
import { TIER_LABEL } from "@/lib/stripe/tiers";
import type { Tier } from "@/types/database";
import AccountClient from "./account-client";
import styles from "../billing.module.css";

// Only page under /billing that requires a session — the pricing page
// and checkout flow stay reachable logged out. Session here comes from
// this site's own login (/billing/login), not the main app's — see
// billing.module.css's own header comment.
export default async function BillingAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/billing/login");

  const { data: student } = await supabase
    .from("students")
    .select("name, tier, subscription_status, payment_status, billing_anniversary_date, stripe_customer_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!student) redirect("/billing/login?error=student_not_found");

  const { renewalDate } = renewalInfo(student.billing_anniversary_date);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title} style={{ textAlign: "left" }}>
        Your plan
      </h1>
      <div className={styles.card} style={{ maxWidth: 480, margin: "0 0 24px", textAlign: "left" }}>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Plan</span>
          <span className={styles.badge}>{TIER_LABEL[student.tier as Tier]}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Status</span>
          <span>{student.subscription_status === "active" ? "Active" : student.subscription_status === "cancelled" ? "Cancelled" : "Paused"}</span>
        </div>
        {student.payment_status === "dnc" && (
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Payment</span>
            <span className={styles.errorText} style={{ margin: 0 }}>
              Needs attention
            </span>
          </div>
        )}
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Renews</span>
          <span>{renewalDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>
      <AccountClient hasStripeAccount={!!student.stripe_customer_id} />
    </div>
  );
}
