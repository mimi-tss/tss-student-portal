import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import BugReportsClient, { type BugReport } from "./bug-reports-client";
import styles from "../../admin.module.css";

// Submissions from the "Found a bug? Report" button in the student +
// coach headers (components/bug-report-button.tsx, migration 0109).
// Read through the admin's own session (RLS: is_admin()); screenshots
// sit in the private bug-reports bucket, so they're shown via signed
// URLs minted here with the service-role client. No page-level role
// check — app/(admin)/layout.tsx gates the whole route group.
export default async function BugReportsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  const allPaths = rows.flatMap((r) => r.screenshot_paths as string[]);
  const signed = new Map<string, string>();
  if (allPaths.length) {
    const { data: urls } = await createAdminClient()
      .storage.from("bug-reports")
      .createSignedUrls(allPaths, 60 * 60);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const reports: BugReport[] = rows.map((r) => ({
    id: r.id,
    reporterName: r.reporter_name,
    reporterRole: r.reporter_role,
    email: r.email,
    message: r.message,
    pageUrl: r.page_url,
    userAgent: r.user_agent,
    status: r.status,
    createdAt: r.created_at,
    screenshots: (r.screenshot_paths as string[]).map((p) => signed.get(p)).filter((u): u is string => !!u),
  }));

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Bug reports</h1>
      {error ? (
        <p className={styles.errorText}>Couldn&apos;t load bug reports: {error.message}</p>
      ) : (
        <BugReportsClient initialReports={reports} />
      )}
    </main>
  );
}
