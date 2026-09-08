import BillingLoginForm from "./login-form";
import styles from "../billing.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That link is missing its login token.",
  expired_link: "That login link has expired or was already used — request a new code below.",
  student_not_found: "We couldn't find your account.",
  session_failed: "Something went wrong creating your session — try again.",
};

export default async function BillingLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] : null;

  return (
    <div className={styles.centerCard}>
      <div className={styles.card}>
        <h1 className={styles.title} style={{ fontSize: 22 }}>
          Manage your billing
        </h1>
        {message && <p className={styles.errorText}>{message}</p>}
        <p className={styles.helpText}>Enter your email — we&apos;ll send you a code to verify it&apos;s really you.</p>
        <BillingLoginForm />
      </div>
    </div>
  );
}
