import { Anton, Inter } from "next/font/google";
import LoginForm from "./login-form";
import styles from "./login.module.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-inter" });

const ERROR_MESSAGES: Record<string, string> = {
  not_logged_in: "Please log in from your portal link to continue.",
  unauthorized: "You don't have access to that page.",
  no_portal_access: "Your current plan doesn't include portal access — upgrade to Suite or higher to get in.",
  missing_token: "That link is missing its login token.",
  expired_link: "That login link has expired or was already used — request a new one below.",
  student_not_found: "We couldn't find your account.",
  session_failed: "Something went wrong creating your session — try again.",
};

// The one public, unauthenticated page in this app. Doubles as: (1) the
// redirect target for an expired/invalid magic link, and (2) the fallback
// a Kajabi Library Card lands on for someone whose portal session has
// actually gone (new device, cleared cookies, long absence) — Kajabi has
// no SSO and can't hand this app an identity directly (confirmed against
// Kajabi's own docs), so "enter your email, get a fresh code" is the real
// floor of what's possible for that case. A typed code (not a clicked
// link) is deliberate: a link opens a new tab, breaking out of a Kajabi
// iframe embed; a code can be typed right back into the same embedded
// page.
//
// "Let's verify it's really you" rather than a role-specific line — this
// one page serves all four account types (student/coach/admin/admin_finance,
// see lib/auth/resolve-account.ts), so it can't commit to "you are a
// student" before it even knows who's typing.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] : null;

  return (
    <div className={`${anton.variable} ${inter.variable} ${styles.root}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>Private Coaching Studio</h1>
        {message && <p className={styles.errorText}>{message}</p>}
        <p className={styles.helpText}>You&apos;re entering the studio portal — let&apos;s verify it&apos;s really you.</p>
        <LoginForm />
      </div>
    </div>
  );
}
