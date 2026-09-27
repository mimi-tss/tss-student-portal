import { renderEmail, smsText, type EmailBlock } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";
import { describeCredits } from "@/lib/email/templates/lesson-credits";

// Student booking confirmation + cancellation (session_booked,
// group_session_booked, session_cancelled). Copy approved by the studio
// 2026-09-26. Email + bell, plus text if the student turned on
// Alerts → Text.

export interface BookedLesson {
  lessonDate: string; // "Tuesday, Sep 29"
  lessonShortDate: string; // "Sep 29"
  lessonDay: string; // "Tue"
  lessonTime: string; // "4:00 PM ET"
}

interface Rendered {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  sms: string;
  bellTitle: string;
  bellBody: string;
}

const MEET_NOTE = "Your Google Meet link will pop up in your portal chat 10 minutes before we start.";

// label: "Private Coaching Session", "Trial Lesson", or a group session
// name ("Group Coaching Session", "Bootcamp C2").
export function bookingConfirmed(i: {
  firstName: string;
  coachFirstName: string;
  label: string;
  isGroup: boolean;
  durationMinutes: number;
  lessons: BookedLesson[]; // 1, or several for a group series sign-up
}): Rendered {
  const coach = `Coach ${i.coachFirstName}`;
  const first = i.lessons[0];
  const many = i.lessons.length > 1;
  const subject = `You're booked! ${i.label} with ${coach}`;
  const preheader = many
    ? `${i.lessons.length} sessions, starting ${first.lessonDate} at ${first.lessonTime}.`
    : `${first.lessonDate} at ${first.lessonTime}.`;

  const blocks: EmailBlock[] = [
    {
      type: "p",
      text: many
        ? `You're signed up for **${i.lessons.length} ${i.label}s** with **${coach}**.`
        : `Your ${i.isGroup ? "" : "1:1 "}${i.label} with **${coach}** is booked.`,
    },
    {
      type: "card",
      title: many ? "Your sessions" : i.isGroup ? "Your session" : "Your lesson",
      lines: many
        ? i.lessons.map((l) => `${l.lessonDate} · ${l.lessonTime}`)
        : [
            `${first.lessonDate} · ${first.lessonTime}`,
            i.label === "Private Coaching Session"
              ? `Private ${i.durationMinutes}-min Coaching Session with ${coach}`
              : `${i.durationMinutes}-min ${i.label} with ${coach}`,
          ],
    },
    { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
    { type: "p", text: MEET_NOTE },
    { type: "note", text: `We'll also send a reminder the day before${many ? " each session" : ""}.` },
  ];

  const { html, text } = renderEmail({
    preheader,
    heading: `You're all set, ${i.firstName}!`,
    blocks,
    reason: "You're getting this because lesson alerts are on.",
  });

  const sms = smsText(
    many
      ? `Hi ${i.firstName}, you're booked for ${i.lessons.length} ${i.label}s with ${coach}, starting ${first.lessonDay}, ${first.lessonShortDate} at ${first.lessonTime}. ${STUDENT_APP_SHORT}`
      : `Hi ${i.firstName}, you're booked! ${i.label} with ${coach} on ${first.lessonDay}, ${first.lessonShortDate} at ${first.lessonTime}. ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );

  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: many ? `Booked: ${i.lessons.length} ${i.label}s` : `Booked: ${i.label}`,
    bellBody: `${first.lessonDay}, ${first.lessonShortDate} · ${first.lessonTime} with ${coach}${many ? " (first session)" : ""}`,
  };
}

// outcome:
//   "credit"    — student/admin regular cancel with 24h+ notice (credit
//                 added, or the one it used given back)
//   "no_credit" — inside 24h, or over the monthly/yearly credit limit
//   "studio"    — staff cancel (studio's side) with a credit
// (A staff cancel WITHOUT a credit — e.g. unpaid — sends nothing; the
// studio handles that conversation personally.)
export function lessonCancelled(i: {
  firstName: string;
  coachFirstName: string;
  label: string;
  lesson: BookedLesson;
  outcome: "credit" | "no_credit" | "studio";
  credit: { durationMinutes: number; expiresAt: string | null } | null;
}): Rendered {
  const coach = `Coach ${i.coachFirstName}`;
  const when = `${i.lesson.lessonDate} at ${i.lesson.lessonTime}`;
  const studio = i.outcome === "studio";
  const subject = studio
    ? `We had to cancel your lesson on ${i.lesson.lessonShortDate}`
    : `Your lesson on ${i.lesson.lessonShortDate} has been cancelled`;
  const creditLine = i.credit ? describeCredits([i.credit])[0] : null;
  const bookBy = creditLine?.includes(" · book by ") ? ` Book it by **${creditLine.split(" · book by ")[1]}**.` : "";

  const blocks: EmailBlock[] = [
    studio
      ? {
          type: "p",
          text: `We had to cancel your ${i.label} with **${coach}** on **${when}**. A lesson credit has been added to your account so you can rebook at no cost.${bookBy}`,
        }
      : { type: "p", text: `Your ${i.label} with **${coach}** on **${when}** has been cancelled.` },
  ];
  if (i.outcome === "credit") {
    blocks.push({
      type: "p",
      text: `**Good news: you haven't lost it.** A lesson credit has been added to your account.${bookBy}`,
    });
  }
  if (i.outcome === "no_credit") {
    blocks.push({
      type: "p",
      text: "Because this was cancelled with less than 24 hours' notice (or your credit limit for this period was reached), a lesson credit wasn't issued this time.",
    });
  }
  blocks.push({ type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL });

  const preheader =
    i.outcome === "no_credit" ? `${i.label} · ${when}` : `A lesson credit has been added to your account.`;
  const { html, text } = renderEmail({
    preheader,
    heading: studio ? `We're sorry, ${i.firstName}` : `Your lesson is cancelled, ${i.firstName}`,
    blocks,
    reason: "You're getting this because lesson alerts are on.",
  });

  // "lesson", not the full label — keeps the text in one segment.
  const smsCredit = i.outcome === "no_credit" ? "" : " A lesson credit was added.";
  const sms = smsText(
    studio
      ? `Hi ${i.firstName}, we had to cancel your lesson with ${coach} on ${i.lesson.lessonShortDate} at ${i.lesson.lessonTime}.${smsCredit} ${STUDENT_APP_SHORT}`
      : `Hi ${i.firstName}, your lesson with ${coach} on ${i.lesson.lessonShortDate} at ${i.lesson.lessonTime} has been cancelled.${smsCredit} ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );

  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: "Lesson cancelled",
    bellBody: `${i.lesson.lessonShortDate} with ${coach}${i.outcome === "no_credit" ? "" : " · credit added"}`,
  };
}
