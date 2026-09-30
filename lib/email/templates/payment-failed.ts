import { renderEmail, smsText } from "@/lib/email/layout";

// "Your payment didn't go through" (payment_failed) — Stripe's
// invoice.payment_failed. Two versions: the first failed attempt, and
// `final` when Stripe's last automatic retry fails (no next attempt).
// Copy approved by the studio 2026-09-30. Always emailed (billing); text
// only for students with any text switch on. The button goes to the
// portal's billing page on the website, never the Kajabi app (payments
// stay web-only).
export function paymentFailed(i: {
  firstName: string;
  amountLabel: string; // "$89"
  planName: string; // "Sing Smarter Pro"
  final: boolean;
}) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/billing/account#billing`;
  const subject = i.final
    ? "Last try: please update your card to keep your membership"
    : "Action needed: your payment didn't go through";
  const preheader = `Your ${i.amountLabel} payment for ${i.planName} was declined. It only takes a minute to fix.`;
  const { html, text } = renderEmail({
    preheader,
    heading: `Your payment didn't go through, ${i.firstName}`,
    blocks: [
      { type: "p", text: `We tried to charge **${i.amountLabel}** for your **${i.planName}** membership, but your card was declined.` },
      ...(i.final
        ? [{ type: "p" as const, text: "This was our last automatic try. Please update your card so your membership doesn't end." }]
        : []),
      {
        type: "card",
        title: "What to do",
        lines: i.final
          ? ["Update your card in your account", "Once it's updated, your membership carries on as usual"]
          : ["Update your card in your account", "We'll retry the payment automatically, so there's no need to pay twice"],
      },
      { type: "button", label: "UPDATE MY CARD", url },
      { type: "note", text: "Until it's updated, you won't be able to book new lessons." },
      { type: "p", text: "Questions? Just reply to this email." },
    ],
    reason: "You're getting this because a payment on your membership didn't go through.",
    replyLine: "Just hit reply. It goes straight to the studio.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      `Hi ${i.firstName}, your Tara Simon Studios payment didn't go through. Please update your card: portal.tarasimonstudios.com/billing/account`,
      { brandPrefix: false },
    ),
    bellTitle: i.final ? "Last try: update your card" : "Your payment didn't go through",
    bellBody: `${i.amountLabel} for ${i.planName} · update your card to keep booking`,
  };
}
