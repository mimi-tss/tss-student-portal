import { Anton, Inter } from "next/font/google";
import styles from "../help/help.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });

// Public legal pages (/termsofuse2026, /privacypolicy2026). Linked from the
// App Store listing, so logged-out visitors must be able to read them —
// same tokens as the public help center.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${anton.variable} ${inter.variable} ${styles.base}`}>{children}</div>;
}
