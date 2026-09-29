import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminThread } from "@/lib/support/admin";
import SupportThreadClient from "./support-thread-client";
import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

export default async function SupportThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const detail = await loadAdminThread(createAdminClient(), threadId);
  if (!detail) notFound();

  return (
    <main className={styles.wrap}>
      <Link href="/admin/support" className={styles.backLink}>
        ← Support chat
      </Link>
      <SupportThreadClient initial={detail} />
    </main>
  );
}
