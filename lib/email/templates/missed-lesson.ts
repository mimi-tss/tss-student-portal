import { renderEmail, smsText } from "@/lib/email/layout";

// Missed lesson (session_missed): the coach marked a 1:1 session no-show
// and it stayed that way for the 2-hour grace period
// (app/api/cron/session-reminders). Built on the studio's own check-in
// wording (2026-09-28): the goal is a REPLY with the reason — replies go
// to the studio inbox — plus the policy: 2 missed lessons with no reply
// = removed from the coach's schedule, no makeups, until they rebook a
// better recurring time (the studio does this by hand; nothing
// automatic). No app button on purpose: replying is the one action we
// want. Email + bell, plus an optional text (Alerts → Text) — text replies
// land in the studio's GHL Conversations inbox.
export function missedLesson(i: {
  firstName: string;
  coachFirstName: string;
  lessonDate: string; // "Monday, Sep 28"
  lessonDay: string; // "Mon"
  lessonShortDate: string; // "Sep 28"
  lessonTime: string; // "4:00 PM ET"
  durationMinutes: number;
}) {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `We missed you today, ${i.firstName}. Is everything okay?`;
  const preheader = "We just wanted to check in and see how you're doing.";
  const { html, text } = renderEmail({
    preheader,
    heading: `We missed you today, ${i.firstName}`,
    blocks: [
      {
        type: "p",
        text: `We noticed that you weren't able to attend your Private ${i.durationMinutes}-min Coaching Session with **${coach}** on **${i.lessonDate} at ${i.lessonTime}**. We just wanted to check in and see how you're doing!`,
      },
      {
        type: "p",
        text: "Is everything okay on your end? If there was a scheduling issue or something came up, **please reply to this email and let us know**.",
      },
      {
        type: "p",
        text: "Your progress is important to us, and we want to make sure you're able to continue learning and growing your voice.",
      },
      {
        type: "card",
        title: "Please note",
        lines: [
          "Please reply so we know you're okay",
          "If we don't hear from you after 2 missed lessons, you'll be removed from your coach's schedule and missed lessons can't be made up, until you rebook a regular time that works better for you.",
        ],
      },
      {
        type: "note",
        text: "Tip: if you cancel in the app at least 24 hours ahead, you'll get a lesson credit to reschedule.",
      },
      { type: "p", text: "Looking forward to hearing from you!" },
    ],
    reason: "You're getting this because a lesson was marked as missed.",
    replyLine: "Just hit reply. It goes straight to the studio.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      `Hi ${i.firstName}, we missed you at your lesson with ${coach} today (${i.lessonDay}, ${i.lessonShortDate}). Is everything okay? Reply here or to our email.`,
      { brandPrefix: false },
    ),
    bellTitle: "We missed you today",
    bellBody: `${i.lessonDate} with ${coach} · please reply to our email`,
  };
}

// Missed GROUP session: no schedule consequence, just a heads-up that the
// session counts as used and no credit is applied (studio call
// 2026-09-28). Same 2-hour grace period as 1:1.
export function missedGroupSession(i: {
  firstName: string;
  coachFirstName: string;
  sessionLabel: string; // "Group Coaching Session", "Bootcamp C2"
  lessonDate: string;
  lessonDay: string;
  lessonShortDate: string;
  lessonTime: string;
}) {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `We missed you at today's ${i.sessionLabel}, ${i.firstName}`;
  const preheader = "No credit is applied for a missed group session.";
  const { html, text } = renderEmail({
    preheader,
    heading: `We missed you today, ${i.firstName}`,
    blocks: [
      {
        type: "p",
        text: `We noticed you weren't able to join your ${i.sessionLabel} with **${coach}** on **${i.lessonDate} at ${i.lessonTime}**. We hope everything's okay!`,
      },
      {
        type: "card",
        title: "Just so you know",
        lines: ["No credit applied", "Since this group session was missed, it counts as used and no credit has been applied."],
      },
      { type: "p", text: "We'd love to see you at the next one!" },
      { type: "note", text: "Did something come up, or think this is a mistake? Just reply to this email." },
    ],
    reason: "You're getting this because a group session was marked as missed.",
    replyLine: "Just hit reply. It goes straight to the studio.",
  });
  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      `Hi ${i.firstName}, we missed you at your ${i.sessionLabel} with ${coach} today (${i.lessonDay}, ${i.lessonShortDate}). No credit was applied for it. Reply with any questions.`,
      { brandPrefix: false },
    ),
    bellTitle: "Missed group session",
    bellBody: `${i.lessonShortDate} with ${coach} · no credit applied`,
  };
}
