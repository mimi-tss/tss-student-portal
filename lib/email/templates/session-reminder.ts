import { renderEmail, smsText } from "@/lib/email/layout";

export interface RenderedNotification {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  sms: string;
}

export interface SessionReminderInput {
  firstName: string;
  coachName: string;
  lessonDate: string; // "Tuesday, Sep 23"
  lessonDay: string; // "Tue"
  lessonTime: string; // "4:00 PM ET"
  durationMinutes: number;
  portalUrl: string;
}

// 24h-before lesson reminder (session_reminder_24h).
export function sessionReminder24h(i: SessionReminderInput): RenderedNotification {
  const subject = `Your lesson with ${i.coachName} is tomorrow`;
  const preheader = `${i.lessonDate} at ${i.lessonTime} — here's everything you need.`;

  const { html, text } = renderEmail({
    preheader,
    heading: `See you tomorrow, ${i.firstName}!`,
    blocks: [
      { type: "p", text: `Just a reminder: your voice lesson with **${i.coachName}** is coming up tomorrow.` },
      {
        type: "card",
        title: "Your lesson",
        lines: [`${i.lessonDate} · ${i.lessonTime}`, `${i.durationMinutes} minutes with ${i.coachName}`],
      },
      { type: "button", label: "View my lesson", url: i.portalUrl },
      {
        type: "note",
        text: "Your Google Meet link will pop up in your portal chat 10 minutes before we start. Have some water nearby and give yourself a few minutes to warm up.",
      },
    ],
    reason: "You're getting this because lesson reminders are on.",
  });

  // No "https://" — phones auto-link it anyway, and it keeps the text
  // inside one 160-char segment.
  const shortLink = i.portalUrl.replace(/^https?:\/\//, "");
  const sms = smsText(`reminder, your lesson with ${i.coachName} is tomorrow at ${i.lessonTime}. ${shortLink}`);

  return { subject, preheader, html, text, sms };
}
