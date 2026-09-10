import Link from "next/link";
import { Anton, Inter } from "next/font/google";
import ThemeToggle from "@/components/theme-toggle";
import styles from "./billing.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });

// Standalone site, not gated here — /billing and /billing/checkout/*
// must stay reachable logged out (pricing + signup), only
// /billing/account itself checks for a session (see its own page.tsx).
// Own login (lib/auth/login-code.ts reused fresh on this host, see
// /billing/login) — deliberately not tied to the main app's iframe
// session, per the "log in on the PC, Spotify/Netflix-style" ask.
export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${anton.variable} ${inter.variable} ${styles.root}`}>
      <header className={styles.header} style={{ justifyContent: "space-between" }}>
        <Link href="/billing" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
          <img src="/logo.png" alt="Tara Simon Studios" className={styles.logo} />
          <span className={styles.brand}>Tara Simon Studios</span>
        </Link>
        <ThemeToggle />
      </header>
      {children}
    </div>
  );
}
