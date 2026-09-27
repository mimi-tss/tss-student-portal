import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";

export interface RenderedNotification {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  sms: string;
}

export interface SessionReminderInput {
  firstName: string;
  coachFirstName: string; // "Celine" — shown as "Coach Celine"
  lessonDate: string; // "Tuesday, Sep 23"
  lessonTime: string; // "4:00 PM ET"
  durationMinutes: number;
}

// 24h-before lesson reminder (session_reminder_24h). Copy approved by the
// studio 2026-09-26.
export function sessionReminder24h(i: SessionReminderInput): RenderedNotification {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `Your Private Coaching Session with ${coach} is tomorrow`;
  const preheader = `${i.lessonDate} at ${i.lessonTime} — here's everything you need.`;

  const { html, text } = renderEmail({
    preheader,
    heading: `See you tomorrow, ${i.firstName}!`,
    blocks: [
      { type: "p", text: `Just a reminder: your 1:1 Private Coaching Session with **${coach}** is coming up tomorrow.` },
      {
        type: "card",
        title: "Your lesson",
        lines: [`${i.lessonDate} · ${i.lessonTime}`, `Private ${i.durationMinutes}-min Coaching Session with ${coach}`],
      },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      { type: "p", text: "Your Google Meet link will pop up in your portal chat 10 minutes before we start." },
      { type: "note", text: "You will be in the Waiting Room; please wait for your Coach to let you in." },
      { type: "p", text: "Have some water nearby and give yourself a few minutes to warm up before your lesson." },
    ],
    reason: "You're getting this because lesson reminders are on.",
  });

  const sms = smsText(
    `Hi ${i.firstName}, your Private Coaching Session with ${coach} is tomorrow at ${i.lessonTime}. Log in here: ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );

  return { subject, preheader, html, text, sms };
}
