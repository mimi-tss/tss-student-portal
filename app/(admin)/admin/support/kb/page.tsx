import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSupportSettings } from "@/lib/support/settings";
import SupportKbClient, { type KbArticle } from "./support-kb-client";
import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

// What the help bot knows (every active article goes into its prompt)
// and when a person is around to take over a chat.
export default async function SupportKbPage() {
  const supabase = await createClient();
  const [{ data }, settings] = await Promise.all([
    supabase.from("support_kb_articles").select("*").order("category").order("sort_order"),
    loadSupportSettings(createAdminClient()),
  ]);

  return (
    <main className={styles.wrap}>
      <Link href="/admin/support" className={styles.backLink}>
        ← Support chat
      </Link>
      <h1 className={styles.pageTitle}>Help articles &amp; hours</h1>
      <p className={styles.mutedText} style={{ marginTop: -8, marginBottom: 20 }}>
        The help bot answers only from the active articles below. Anything it can&apos;t answer, it hands to a person.
        Changes apply to its next reply.
      </p>
      <SupportKbClient initialArticles={(data ?? []) as KbArticle[]} initialSettings={settings} />
    </main>
  );
}
