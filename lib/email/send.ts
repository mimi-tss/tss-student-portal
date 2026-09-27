// Minimal transactional email via Resend's HTTP API (no SDK dependency).
// Used for magic-link delivery since Kajabi Pages can't merge a per-member
// token into a link — see lib/auth/magic-link.ts.
export async function sendEmail(to: string, subject: string, html: string, replyTo?: string, text?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      // Sends from the portal subdomain (the Resend-verified one), but
      // replies go to the studio's real inbox.
      reply_to: replyTo || process.env.EMAIL_REPLY_TO || "info@tarasimonstudios.com",
      to,
      subject,
      html,
      // Plain-text part — HTML-only mail is a spam signal.
      ...(text ? { text } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
  }
}
