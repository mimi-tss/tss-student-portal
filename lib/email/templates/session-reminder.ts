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

// ~15 minutes before a 1:1 lesson (session_starting_soon) — so they don't
// forget (studio call 2026-09-28). Email + bell, text if Alerts → Text.
export function sessionStartingSoon(i: SessionReminderInput & { lessonDay: string }): RenderedNotification & {
  bellTitle: string;
  bellBody: string;
} {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `Your lesson with ${coach} starts in 15 minutes`;
  const preheader = `${i.lessonTime} · your Meet link is on its way to your portal chat.`;
  const { html, text } = renderEmail({
    preheader,
    heading: `Almost time, ${i.firstName}!`,
    blocks: [
      { type: "p", text: `Your 1:1 Private Coaching Session with **${coach}** starts in about **15 minutes**.` },
      {
        type: "card",
        title: "Starting soon",
        lines: [`Today · ${i.lessonTime}`, `Private ${i.durationMinutes}-min Coaching Session with ${coach}`],
      },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      { type: "p", text: "Your Google Meet link will pop up in your portal chat 10 minutes before we start." },
      { type: "note", text: "You will be in the Waiting Room; please wait for your Coach to let you in." },
    ],
    reason: "You're getting this because lesson reminders are on.",
  });
  const sms = smsText(
    `Hi ${i.firstName}, your lesson with ${coach} starts in 15 min (${i.lessonTime}). Meet link in your portal chat: ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );
  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: "Your lesson starts in 15 minutes",
    bellBody: `${i.lessonTime} with ${coach}`,
  };
}

// Group session / Bootcamp reminders (same kinds as 1:1: 24h + ~15 min),
// approved by the studio 2026-09-30. Group students join with the
// dashboard's JOIN SESSION button (the coach's link) — there's no Meet
// link chat message for groups.
export interface GroupReminderInput {
  firstName: string;
  coachFirstName: string;
  sessionLabel: string; // "Group Coaching Session", "Bootcamp C2"
  lessonDate: string;
  lessonTime: string;
  durationMinutes: number;
}

export function groupSessionReminder24h(i: GroupReminderInput) {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `Your ${i.sessionLabel} with ${coach} is tomorrow`;
  const preheader = `${i.lessonDate} at ${i.lessonTime} — here's everything you need.`;
  const { html, text } = renderEmail({
    preheader,
    heading: `See you tomorrow, ${i.firstName}!`,
    blocks: [
      { type: "p", text: `Just a reminder: your **${i.sessionLabel}** with **${coach}** is coming up tomorrow.` },
      {
        type: "card",
        title: "Your session",
        lines: [`${i.lessonDate} · ${i.lessonTime}`, `${i.sessionLabel} with ${coach} · ${i.durationMinutes} min`],
      },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      { type: "p", text: "When it's time, tap **JOIN SESSION** on your dashboard." },
      { type: "note", text: "You will be in the Waiting Room; please wait for your Coach to let you in." },
    ],
    reason: "You're getting this because lesson reminders are on.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      `Hi ${i.firstName}, your ${i.sessionLabel} with ${coach} is tomorrow at ${i.lessonTime}. Log in here: ${STUDENT_APP_SHORT}`,
      { brandPrefix: false },
    ),
    bellTitle: `${i.sessionLabel} tomorrow with ${coach}`,
    bellBody: `${i.lessonDate} · ${i.lessonTime} · ${i.durationMinutes} min`,
  };
}

export function groupSessionStartingSoon(i: GroupReminderInput) {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `Your ${i.sessionLabel} with ${coach} starts in 15 minutes`;
  const preheader = `${i.lessonTime} · tap JOIN SESSION on your dashboard.`;
  const { html, text } = renderEmail({
    preheader,
    heading: `Almost time, ${i.firstName}!`,
    blocks: [
      { type: "p", text: `Your **${i.sessionLabel}** with **${coach}** starts in about **15 minutes**.` },
      { type: "card", title: "Starting soon", lines: [`Today · ${i.lessonTime}`, `${i.sessionLabel} with ${coach} · ${i.durationMinutes} min`] },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      { type: "p", text: "Tap **JOIN SESSION** on your dashboard to join." },
      { type: "note", text: "You will be in the Waiting Room; please wait for your Coach to let you in." },
    ],
    reason: "You're getting this because lesson reminders are on.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      `Hi ${i.firstName}, your ${i.sessionLabel} with ${coach} starts in 15 min (${i.lessonTime}). Join from your dashboard: ${STUDENT_APP_SHORT}`,
      { brandPrefix: false },
    ),
    bellTitle: `Your ${i.sessionLabel} starts in 15 minutes`,
    bellBody: `${i.lessonTime} with ${coach}`,
  };
}
