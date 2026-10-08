import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";

// Confirmation when a student adds a recurring add-on (studio call
// 2026-10-08): bi-weekly lessons (30/60 min, Suite) or the 60-min upgrade
// (Pro). Until bi-weekly students can pick their own time, they reply with
// times and the team sets the every-other-week slot. Email + text
// (Bookings & changes switch) + bell.
export function addonAdded(i: { firstName: string; addonId: string; coachFirstName: string | null }) {
  const coach = i.coachFirstName ? `Coach ${i.coachFirstName}` : "a TSS Master Coach";
  const biweekly = i.addonId === "biweekly_30min_suite" || i.addonId === "biweekly_60min_suite";
  const minutes = i.addonId === "biweekly_60min_suite" ? 60 : 30;
  const name = biweekly ? `${minutes}-min Bi-weekly Lessons` : "60-min Lessons";
  const subject = `Your ${name} are added! 🎵`;
  const preheader = biweekly ? "Next: let's set your every-other-week lesson time." : "Your weekly lessons are going to 60 minutes.";
  const blocks = biweekly
    ? [
        {
          type: "p" as const,
          text: `**${name}** are now part of your Sing Smarter Suite membership: a private ${minutes}-min lesson with ${coach} every other week.`,
        },
        { type: "h2" as const, text: "Next step: your lesson time" },
        {
          type: "p" as const,
          text: `**Reply to this email with 2–3 days and times** that work for you, and we'll lock in your every-other-week spot with ${coach}.`,
        },
        { type: "button" as const, label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      ]
    : [
        { type: "p" as const, text: `Your weekly lessons with ${coach} are going to **60 minutes**. We'll update your schedule and let you know when it starts.` },
        { type: "note" as const, text: "Questions? Just reply to this email." },
        { type: "button" as const, label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      ];
  const { html, text } = renderEmail({
    preheader,
    heading: `You're all set, ${i.firstName}!`,
    blocks,
    reason: "You're getting this because you added to your membership.",
    replyLine: "Just hit reply. It goes straight to the studio.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      biweekly
        ? `Hi ${i.firstName}, your ${name} are added! Reply to our email with times that work for you.`
        : `Hi ${i.firstName}, your lessons are going to 60 minutes! We'll update your schedule and let you know.`,
      { brandPrefix: false },
    ),
    bellTitle: `${name} added`,
    bellBody: biweekly ? "Reply to our email with times that work for you" : "We'll update your schedule and let you know",
  };
}
