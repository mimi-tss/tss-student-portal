import Link from "next/link";
import { redirect } from "next/navigation";
import { Anton, Inter, Caveat } from "next/font/google";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TimeZoneProvider } from "@/components/timezone-context";
import TimeZoneNavControl from "@/components/timezone-nav-control";
import styles from "./student.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });
const caveat = Caveat({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-caveat" });

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Portal access scales with tier (TSS_App_Spec_1.md section 2) — Lite
// gets none at all. requireRole only confirms "this is a student
// account"; this checks whether that student's current tier is even
// allowed in here.
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("student");

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("tier, name")
    .eq("profile_id", user.id)
    .single();

  if (!student || student.tier === "lite") {
    redirect("/login?error=no_portal_access");
  }

  return (
    <TimeZoneProvider defaultZone={DEFAULT_TIMEZONE} autoDetect>
      <div className={`${anton.variable} ${inter.variable} ${caveat.variable} ${styles.root}`}>
        <header className={styles.header}>
          <div className={styles.logoMark}>
            <div className={styles.logoPlaceholder}>LOGO</div>
          </div>
          <nav className={styles.nav}>
            <Link href="/student/dashboard" className={styles.navLinkActive}>
              Dashboard
            </Link>
            <Link href="/student/book" className={styles.navLink}>
              Book / reschedule
            </Link>
            <Link href="/student/chat" className={styles.navLink}>
              Chat
            </Link>
            <TimeZoneNavControl dark />
          </nav>
          <div className={styles.avatar}>{initials(student.name)}</div>
        </header>
        {children}
      </div>
    </TimeZoneProvider>
  );
}
