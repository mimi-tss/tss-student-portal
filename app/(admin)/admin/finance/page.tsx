import { createClient } from "@/lib/supabase/server";
import { requireFinanceAccess } from "@/lib/auth/require-role";
import FinanceClient from "./finance-client";
import styles from "../../admin.module.css";

// Only "admin_finance" gets Finance — a plain "admin" is redirected back
// to Overview, even on a direct URL hit (requireFinanceAccess).
export default async function AdminFinancePage() {
  await requireFinanceAccess();
  const supabase = await createClient();
  const { data: coaches } = await supabase.from("coaches").select("id, name, hourly_rate, active").order("name");

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Finance</h1>
      <FinanceClient coaches={coaches ?? []} />
    </main>
  );
}
