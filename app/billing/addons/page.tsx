import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddonsClient from "./addons-client";
import styles from "../billing.module.css";

// Its own route (not folded into /billing/account) so the studio can
// share it directly — e.g. a promo link for Suite's biweekly-lessons
// add-on. A logged-out visit bounces to /billing/login?next=/billing/
// addons, which sends them right back here after verifying (see
// login-form.tsx / api/billing/auth/verify-code), instead of dropping
// them on the generic account page.
export default async function BillingAddonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/billing/login?next=/billing/addons");

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title} style={{ textAlign: "left" }}>
        Add-ons
      </h1>
      <AddonsClient />
    </div>
  );
}
