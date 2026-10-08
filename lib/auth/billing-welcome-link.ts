import { mintMagicLinkToken } from "@/lib/auth/magic-link";
import { sendEmail } from "@/lib/email/send";
import { accountLinkEmail, welcomeEmail } from "@/lib/email/templates/membership";
import { firstNameOf } from "@/lib/ghl/fields";
import type { Tier } from "@/types/database";

// Billing equivalent of issueAndSendLoginLink (lib/auth/magic-link.ts) —
// same single-use, hashed, 30-day token primitive (mintMagicLinkToken),
// but pointed at billing's own link-consumption route instead of the
// Kajabi one, since a fresh Stripe signup has no Kajabi login flow to
// land in.
//
// With `welcome` (a fresh sign-up) it's the branded "Welcome to Sing
// Smarter Pro" email carrying the link; without it (the link rotates and
// is re-sent on every use — app/api/billing/auth/link) it's a short
// "here's your account link" note, so nobody gets "Welcome!" twice.
// Sent straight via Resend like the other login emails — never held by
// the notification pause, since it's how a new member gets in.
export async function issueAndSendBillingWelcomeLink(
  studentId: string,
  email: string,
  welcome?: { tier: Tier; name: string | null; firstSession?: boolean; ownedAddonIds?: string[] },
) {
  const token = await mintMagicLinkToken(studentId);
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/auth/link?token=${token}`;

  const msg = welcome
    ? welcomeEmail({
        firstName: firstNameOf(welcome.name),
        tier: welcome.tier,
        accountUrl: url,
        firstSession: welcome.firstSession,
        ownedAddonIds: welcome.ownedAddonIds,
      })
    : accountLinkEmail({ accountUrl: url });
  await sendEmail(email, msg.subject, msg.html, undefined, msg.text);

  return url;
}
