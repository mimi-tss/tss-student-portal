import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";
import type { RenderedNotification } from "@/lib/email/templates/session-reminder";

export interface ChatMessageInput {
  firstName: string;
  // "Coach Nikki", or "Tara Simon Studios" when an admin sent it.
  senderLabel: string;
  message: string;
}

// Cuts at a word boundary and adds "…" — never mid-word, never a
// dangling space before the ellipsis.
export function previewOf(message: string, max: number): string {
  const flat = message.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

// New chat message to a student from their coach or the studio
// (chat_message). Email + SMS only — deliberately no bell row, chat has
// its own screen and the studio didn't want the bell flooded (2026-09-26).
export function chatMessage(i: ChatMessageInput): RenderedNotification {
  const subject = `${i.senderLabel} sent you a message`;
  const emailPreview = previewOf(i.message, 140);
  const preheader = emailPreview;

  const { html, text } = renderEmail({
    preheader,
    heading: `You have a new message, ${i.firstName}!`,
    blocks: [
      { type: "quote", text: emailPreview, from: i.senderLabel },
      { type: "button", label: "REPLY IN THE SING SMARTER APP", url: STUDENT_APP_URL },
      {
        type: "p",
        text: i.senderLabel.startsWith("Coach ")
          ? `**Please reply in the app.** Replying to this email won't reach ${i.senderLabel}.`
          : "**Please reply in the app** so your message stays with your lesson chat.",
      },
    ],
    reason: "You're getting this because message alerts are on.",
    replyLine: "",
  });

  // Budget the quote so the whole text stays in one segment with GHL's
  // opt-out line: fixed copy is ~80 chars + the two names. 128, not 130:
  // the "…" becomes "..." (+2) once smsText flattens it to GSM.
  const fixed = `Hi ${i.firstName}, ${i.senderLabel} sent you a message: "" Reply here: ${STUDENT_APP_SHORT}`;
  const smsQuote = previewOf(i.message, Math.max(30, 128 - fixed.length));
  const sms = smsText(`Hi ${i.firstName}, ${i.senderLabel} sent you a message: "${smsQuote}" Reply here: ${STUDENT_APP_SHORT}`, {
    brandPrefix: false,
  });

  return { subject, preheader, html, text, sms };
}
