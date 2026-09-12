import BillingLoginForm from "./login-form";
import styles from "../billing.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That link is missing its login token.",
  expired_link: "That login link has expired or was already used — request a new code below.",
  student_not_found: "We couldn't find your account.",
  session_failed: "Something went wrong creating your session — try again.",
};

// `next` (e.g. from /billing/addons's own redirect) sends a student back
// to whichever billing page they actually meant to reach instead of
// always landing on the generic account page — see login-form.tsx and
// api/billing/auth/verify-code/route.ts, which does the real safety
// check on this value (must be a /billing/* path).
export default async function BillingLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] : null;

  return (
    <div className={styles.centerCard}>
      <div className={styles.card}>
        <h1 className={styles.title} style={{ fontSize: 22 }}>
          Manage your billing
        </h1>
        {message && <p className={styles.errorText}>{message}</p>}
        <p className={styles.helpText}>Enter your email — we&apos;ll send you a code to verify it&apos;s really you.</p>
        <BillingLoginForm next={next} />
      </div>
    </div>
  );
}
