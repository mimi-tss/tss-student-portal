import { renderEmail, smsText, type EmailBlock } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";
import { describeCredits, type LessonCreditLine } from "@/lib/email/templates/lesson-credits";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// "Your credits are ready — book now" after a student buys lessons (add-on
// shop, auto-added) or an admin adds credits by hand. Studio call
// 2026-09-26. Email + bell, text if Lesson credits → Text is on.

export interface GroupCreditsAdded {
  count: number;
  label: string; // "Group Coaching Session"
  coachFirstName: string | null; // null = any coach, they pick
  expiresAt: string | null;
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, month: "long", day: "numeric", year: "numeric" }).format(
    new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000), // same pre-6am rule as lesson-credits.ts
  );

export function creditsAdded(i: {
  firstName: string;
  purchased: boolean; // "Thanks for your purchase!" vs a plain "added to your account"
  lessons: LessonCreditLine[];
  group: GroupCreditsAdded | null;
}) {
  const lessonCount = i.lessons.length;
  const groupCount = i.group?.count ?? 0;
  const what =
    lessonCount && groupCount
      ? "credits"
      : groupCount
        ? `${i.group!.label} credit${groupCount === 1 ? "" : "s"}`
        : `lesson credit${lessonCount === 1 ? "" : "s"}`;
  const total = lessonCount + groupCount;
  const subject = i.purchased ? `Your ${total === 1 ? what : `${total} ${what}`} ${total === 1 ? "is" : "are"} ready to book!` : `${total} new ${what} added to your account`;
  const preheader = "Log in and grab a time that works for you.";

  const blocks: EmailBlock[] = [
    {
      type: "p",
      text: `${i.purchased ? "Thanks for your purchase! " : ""}Your ${total === 1 ? "credit has" : "credits have"} been added to your account and ${total === 1 ? "is" : "are"} ready to book.`,
    },
  ];
  if (lessonCount) blocks.push({ type: "card", title: "Private lessons", lines: describeCredits(i.lessons) });
  if (i.group) {
    const g = i.group;
    blocks.push({
      type: "card",
      title: "Group sessions",
      lines: [
        `${g.count} × ${g.label}${g.expiresAt ? ` · book by ${fmtDate(g.expiresAt)}` : ""}`,
        g.coachFirstName ? `With Coach ${g.coachFirstName}, on any day of the week` : "Pick any coach's session that works for you",
      ],
    });
  }
  blocks.push({ type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL });
  blocks.push({
    type: "p",
    text: `Open your portal and tap **Book a session**${groupCount ? " (or pick a group session from your dashboard)" : ""} to grab a time.`,
  });

  const { html, text } = renderEmail({
    preheader,
    heading: i.purchased ? `You're all set, ${i.firstName}!` : `New credits, ${i.firstName}!`,
    blocks,
    reason: "You're getting this because lesson alerts are on.",
  });

  const sms = smsText(
    `Hi ${i.firstName}, ${total === 1 ? `your ${what} is` : `${total} ${what} are`} in your account and ready to book: ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );

  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: total === 1 ? `New ${what} ready to book` : `${total} new ${what} ready to book`,
    bellBody: "Log in and grab a time that works for you",
  };
}

// "30-min Lesson with Tara Simon": no self-book credit (credits don't carry
// a coach) — the studio schedules it, so the student just hears it's coming.
export function taraLessonPurchased(i: { firstName: string }) {
  const subject = "Thanks! Your lesson with Tara Simon is coming";
  const preheader = "We'll reach out to schedule it with you.";
  const { html, text } = renderEmail({
    preheader,
    heading: `Thank you, ${i.firstName}!`,
    blocks: [
      { type: "p", text: "Your **Private 30-min Coaching Session with Tara Simon** is confirmed. We'll reach out shortly to find a time that works for you." },
      { type: "note", text: "Questions in the meantime? Just reply to this email." },
    ],
    reason: "You're getting this because you made a purchase.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(`Hi ${i.firstName}, thanks for booking a lesson with Tara Simon! We'll reach out shortly to schedule it.`, {
      brandPrefix: false,
    }),
    bellTitle: "Lesson with Tara Simon confirmed",
    bellBody: "We'll reach out to schedule it",
  };
}
