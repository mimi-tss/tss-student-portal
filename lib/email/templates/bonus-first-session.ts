import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";

// Sent when an admin grants a student their free First 1:1 Coaching
// Session (trial) — since that's a deliberate admin choice now, not
// automatic (studio call 2026-09-26). Self sign-ups who get it
// automatically hear about it in their welcome email instead.
export function bonusFirstSession(i: { firstName: string; coachFirstName: string | null }) {
  const withCoach = i.coachFirstName ? ` with Coach ${i.coachFirstName}` : " with a TSS Master Coach";
  const subject = "You've been granted a BONUS First Session!";
  const preheader = `A free First 1:1 Coaching Session${withCoach}, on us.`;
  const { html, text } = renderEmail({
    preheader,
    heading: `🎁 A bonus for you, ${i.firstName}!`,
    blocks: [
      {
        type: "p",
        text: `You've been granted a **free First 1:1 Coaching Session${withCoach}**. It's our gift to help you get started on the right note.`,
      },
      { type: "card", title: "Your bonus", lines: ["First 1:1 Coaching Session", `Free · ${withCoach.trim().replace(/^with /, "with ")}`] },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      { type: "p", text: "Open **Student Access** in the app and pick a time that works for you." },
    ],
    reason: "You're getting this because a bonus was added to your account.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      `Hi ${i.firstName}, BONUS! You got a free First 1:1 Coaching Session${withCoach}. Book it: ${STUDENT_APP_SHORT}`,
      { brandPrefix: false },
    ),
    bellTitle: "🎁 Bonus: free First 1:1 Coaching Session",
    bellBody: `Book it${withCoach} whenever you're ready`,
  };
}
