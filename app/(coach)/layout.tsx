import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TimeZoneProvider } from "@/components/timezone-context";
import ThemeToggle from "@/components/theme-toggle";
import BugReportButton from "@/components/bug-report-button";
import CoachNav from "./coach-nav";
import CoachMenu from "./coach-menu";
import HelpAgentButton from "@/components/help-agent-button";
import { HelpPanelProvider } from "@/components/help-panel";
import { Anton, Inter, Caveat } from "next/font/google";
import styles from "./coach.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });
const caveat = Caveat({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-caveat" });

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireRole("coach");

  // Defaults to the coach's own configured zone (they live and work in
  // it — TSS_App_Spec_1.md section 8) — that's a DB field admin sets per
  // coach, not browser-geolocated (only the student side does that).
  // Falls back to DEFAULT_TIMEZONE (America/New_York — Eastern) if a
  // coach has no zone configured yet.
  const supabase = await createClient();
  const { data: coach } = await supabase
    .from("coaches")
    .select("name, timezone")
    .eq("profile_id", user.id)
    .maybeSingle();

  return (
    <TimeZoneProvider defaultZone={coach?.timezone ?? DEFAULT_TIMEZONE}>
      <div className={`${anton.variable} ${inter.variable} ${caveat.variable} ${styles.root}`}>
        <HelpPanelProvider>
        <header className={styles.header}>
          <div className={styles.logoMark}>
            <img src="/logo.png" alt="Coaching Studio" className={styles.logoPlaceholder} />
          </div>
          <CoachNav />
          <div className={styles.headerRight}>
            {/* Timezone, Fix stuck screen and Refresh live in the avatar
                menu (coach-menu.tsx); on phones these three move there
                too. BugReportButton stays mounted so that menu can still
                open its modal. */}
            <div className={styles.desktopOnly}>
              <BugReportButton defaultEmail={user.email ?? ""} />
              <ThemeToggle />
              <HelpAgentButton />
            </div>
            <span className={styles.roleBadge}>Coach</span>
            <CoachMenu initials={initials(coach?.name ?? "?")} />
          </div>
        </header>
        {children}
        </HelpPanelProvider>
      </div>
    </TimeZoneProvider>
  );
}
