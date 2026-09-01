import { requireRole } from "@/lib/auth/require-role";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TimeZoneProvider } from "@/components/timezone-context";
import { createClient } from "@/lib/supabase/server";
import { getOverviewStats } from "@/lib/admin/attention-items";
import AdminNav from "./admin-nav";
import { Anton, Inter, Caveat } from "next/font/google";
import styles from "./admin.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });
const caveat = Caveat({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-caveat" });

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = await requireRole(["admin", "admin_finance"]);

  // Needs Review sidebar badge — same aggregation the Overview page and
  // the full Needs Review page use, just the count.
  const supabase = await createClient();
  const { needsActionCount } = await getOverviewStats(supabase);

  return (
    <TimeZoneProvider defaultZone={DEFAULT_TIMEZONE}>
      <div className={`${anton.variable} ${inter.variable} ${caveat.variable} ${styles.root}`}>
        <div className={styles.appShell}>
          <AdminNav initialNeedsReviewCount={needsActionCount} role={role} />
          <div className={styles.appMain}>{children}</div>
        </div>
      </div>
    </TimeZoneProvider>
  );
}
