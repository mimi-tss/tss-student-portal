import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";
import type { RenderedNotification } from "@/lib/email/templates/session-reminder";

export interface GroupClassCancelledInput {
  firstName: string;
  coachFirstName: string;
  classLabel: string; // cleaned topic, e.g. "Semi-Private Vocal Group Class"
  lessonDate: string; // "Wednesday, Oct 21"
  lessonShortDate: string; // "Oct 21"
  lessonTime: string; // "7:00 PM ET"
  // A replacement credit is only issued when the class has a topic to
  // tie it to — without one the student needs the studio to rebook.
  creditAdded: boolean;
}

// Group class auto-cancelled ~24h out for low enrollment
// (group_lesson_cancelled). Copy approved by the studio 2026-09-26.
export function groupClassCancelled(
  i: GroupClassCancelledInput,
): RenderedNotification & { bellTitle: string; bellBody: string } {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `Your ${i.classLabel} tomorrow has been cancelled`;
  const preheader = i.creditAdded
    ? "Not enough students signed up. A credit has been added to your account."
    : "Not enough students signed up. Reply and we'll help you rebook.";

  const { html, text } = renderEmail({
    preheader,
    heading: `Sorry, ${i.firstName}, tomorrow's session is cancelled`,
    blocks: [
      {
        type: "p",
        text: `Not enough students signed up for your **${i.classLabel}** with **${coach}**, so we've had to cancel it.`,
      },
      {
        type: "card",
        title: "Cancelled session",
        lines: [`${i.lessonDate} · ${i.lessonTime}`, `${i.classLabel} with ${coach}`],
      },
      i.creditAdded
        ? {
            type: "p",
            text: `**Good news: you haven't lost anything.** We've added a credit to your account, so you can join another ${i.classLabel} at no extra cost.`,
          }
        : { type: "p", text: "Just reply to this email and we'll help you find another class." },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
    ],
    reason: "You're getting this because class alerts are on.",
  });

  const sms = smsText(
    `Hi ${i.firstName}, your ${i.classLabel} with ${coach} tomorrow (${i.lessonShortDate}) is cancelled - not enough students signed up. ${
      i.creditAdded ? "A credit has been added to your account" : "Reply and we'll help you rebook"
    }: ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );

  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: `${i.classLabel} cancelled`,
    bellBody: `${i.lessonShortDate} with ${coach} · ${i.creditAdded ? "credit added to your account" : "contact the studio to rebook"}`,
  };
}
