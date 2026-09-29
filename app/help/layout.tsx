import { Anton, Inter } from "next/font/google";
import styles from "./help.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });

// Everything under /help — the public help center (articles) and Mel's
// chat at /help/chat. Public: logged-out students and the Kajabi app menu
// land here, so it carries the design tokens itself (outside every route
// group).
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${anton.variable} ${inter.variable} ${styles.base}`}>{children}</div>;
}
