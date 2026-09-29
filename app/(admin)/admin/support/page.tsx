import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAdminThreads } from "@/lib/support/admin";
import SupportInboxClient from "./support-inbox-client";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

// Help-chat inbox (/help, migration 0111). Threads waiting for a person
// sort to the top; the client polls for new ones. Role gate is the
// (admin) layout; the API it polls checks the role again.
export default async function SupportInboxPage() {
  const threads = await listAdminThreads(createAdminClient());
  return (
    <main className={styles.wrap}>
      <div className={styles.pageHeadRow}>
        <h1 className={styles.pageTitle}>Support chat</h1>
        <Link href="/admin/support/kb" className={styles.ctaSmall}>
          Help articles &amp; hours
        </Link>
      </div>
      <SupportInboxClient initialThreads={threads} />
    </main>
  );
}
