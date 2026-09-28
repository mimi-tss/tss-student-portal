import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import BugReportForm from "@/components/bug-report-form";
import formStyles from "@/components/bug-report-button.module.css";
import styles from "./report-bug.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Report an Issue — Tara Simon Studios" };

// Shareable bug-report link (portal.tarasimonstudios.com/report-bug) for
// texts/emails/the Kajabi app — same form as the header "Report" button's
// modal. Outside every route group and works logged out (students
// mostly arrive via the Kajabi app without a portal session); a
// logged-in visitor just gets their email prefilled and the report tied
// to their account.
export default async function ReportBugPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className={`${anton.variable} ${inter.variable} ${styles.root}`}>
      <main className={styles.card}>
        <div className={formStyles.modalHead}>
          <h1 className={formStyles.title}>Report an Issue</h1>
        </div>
        <BugReportForm defaultEmail={user?.email ?? ""} />
      </main>
    </div>
  );
}
