import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import HelpChat from "./help-chat";
import styles from "./help.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Help — Tara Simon Studios" };

// Public help chat — the one door for portal, Kajabi courses and
// Backstage questions. Linked from the Kajabi app menu, the student nav
// and the login page. Works logged out (general + login help) and
// logged in (the student's own lessons, credits, settings). The bot
// answers first; a person takes over from /admin/support when needed.
export default function HelpPage() {
  return (
    <div className={`${anton.variable} ${inter.variable} ${styles.root}`}>
      <HelpChat />
    </div>
  );
}
