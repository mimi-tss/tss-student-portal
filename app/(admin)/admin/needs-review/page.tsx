import { Suspense } from "react";
import NeedsReviewClient from "./needs-review-client";
import styles from "../../admin.module.css";

// Full manual-work queue — Needs Action / In Progress / Resolved tabs,
// each item can be moved between the three and annotated with a note.
// Same underlying attention_items table the Overview page's preview
// pulls from (lib/admin/attention-items.ts).
export default function AdminNeedsReviewPage() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Needs Review</h1>
      <Suspense fallback={<p className={styles.mutedText}>Loading…</p>}>
        <NeedsReviewClient />
      </Suspense>
    </div>
  );
}
