import { mintMagicLinkToken } from "@/lib/auth/magic-link";
import { sendEmail } from "@/lib/email/send";

// Billing equivalent of issueAndSendLoginLink (lib/auth/magic-link.ts) —
// same single-use, hashed, 30-day token primitive (mintMagicLinkToken),
// but pointed at billing's own link-consumption route instead of the
// Kajabi one, since a fresh Stripe signup has no Kajabi login flow to
// land in. Kept separate from issueAndSendLoginLink rather than
// parameterizing it, so the existing Kajabi-triggered email (copy, URL)
// stays untouched.
export async function issueAndSendBillingWelcomeLink(studentId: string, email: string) {
  const token = await mintMagicLinkToken(studentId);
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/auth/link?token=${token}`;

  await sendEmail(
    email,
    "Welcome to Tara Simon Studios — access your account",
    `<p>Thanks for signing up! Tap below to access your billing account — no password needed:</p>
     <p><a href="${url}">Access my account</a></p>`,
  );

  return url;
}
