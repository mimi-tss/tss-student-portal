import { createClient } from "@/lib/supabase/server";
import { requireFinanceAccess } from "@/lib/auth/require-role";
import ReportsClient from "./reports-client";
import styles from "../../admin.module.css";

// Only "admin_finance" gets Reports — a plain "admin" is redirected back
// to Overview, even on a direct URL hit (requireFinanceAccess).
export default async function AdminReportsPage() {
  await requireFinanceAccess();
  const supabase = await createClient();
  const { data: coaches } = await supabase.from("coaches").select("id, name").eq("active", true).order("name");

  return (
    <div className={styles.wrap}>
      <ReportsClient coaches={coaches ?? []} />
    </div>
  );
}
