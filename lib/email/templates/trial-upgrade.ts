import { renderEmail } from "@/lib/email/layout";

// After a Suite member's free first 1:1 session (studio call 2026-10-02):
// email 1 about 2 hours after the session ends (once the coach has marked
// it attended), email 2 four days later if they're still on Suite. Email
// only — promotional texts need separate carrier approval. Leads with
// "everything you have now, plus", then each Pro extra on its own line.
export function trialUpgradeOffer(i: { firstName: string; coachFirstName: string; followUp: boolean }) {
  const coach = `Coach ${i.coachFirstName}`;
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/billing/account#billing`;
  const subject = i.followUp ? `Keep your momentum going with ${coach}` : `How was your first session with ${coach}?`;
  const preheader = i.followUp
    ? `Lock in your weekly time with ${coach}.`
    : `Keep everything you have now, plus weekly lessons with ${coach}.`;
  const { html, text } = renderEmail({
    preheader,
    heading: i.followUp ? `Don't let your voice cool off, ${i.firstName}!` : `Great work today, ${i.firstName}! 🎵`,
    blocks: [
      {
        type: "p",
        text: i.followUp
          ? `Your voice is warmed up, so keep it going. Lock in your weekly time with **${coach}**.`
          : `Thanks for singing with **${coach}**. Your first session is just the start. The fastest progress happens when you work with your coach every week.`,
      },
      { type: "h2", text: "Sing Smarter Pro: everything you have now, plus" },
      {
        type: "list",
        items: [
          `✓ A weekly 1:1 lesson with ${coach}, at a regular time that suits you`,
          "✓ 4 lessons a month, plus every lesson recorded",
          "✓ Sing Like a Superstar Master Course",
          "✓ Riffs & Runs Master Course",
        ],
      },
      { type: "p", text: "**$399/month.** Change or cancel anytime." },
      { type: "button", label: "UPGRADE TO PRO", url },
      { type: "p", text: `Once you upgrade, we'll set up your weekly time with ${coach}.` },
      { type: "note", text: "Questions? Just reply to this email." },
    ],
    reason: "You're getting this because you just had your first coaching session with us.",
    replyLine: "Just hit reply. It goes straight to the studio.",
  });
  return { subject, preheader, html, text, sms: "" };
}
