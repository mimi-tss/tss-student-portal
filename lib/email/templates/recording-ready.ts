import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";
import type { RenderedNotification } from "@/lib/email/templates/session-reminder";

export interface RecordingReadyInput {
  firstName: string;
  coachFirstName: string;
  // "Private Coaching Session" for a 1:1, the class topic for a group
  // lesson ("Belting Basics").
  lessonLabel: string;
  isGroup: boolean;
  lessonDate: string; // "Sunday, Sep 27"
  lessonTime: string; // "8:30 AM ET"
}

// A lesson recording was just added to the student's folder
// (recording_ready). Copy approved by the studio 2026-09-26.
export function recordingReady(i: RecordingReadyInput): RenderedNotification & { bellTitle: string; bellBody: string } {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `Your lesson recording with ${coach} is ready`;
  const preheader = `${i.lessonLabel} · ${i.lessonDate} — watch it back and practice along.`;
  const fromWhat = `your ${i.lessonLabel} with **${coach}**`;

  const { html, text } = renderEmail({
    preheader,
    heading: `Your recording is ready, ${i.firstName}!`,
    blocks: [
      { type: "p", text: `Your recording from ${fromWhat} has been added to your folder.` },
      {
        type: "card",
        title: "Your recording",
        lines: [`${i.lessonDate} · ${i.lessonTime}`, `${i.lessonLabel} with ${coach}`],
      },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      {
        type: "p",
        text: "Watching it back is one of the fastest ways to improve. Listen for what your coach pointed out, and practice along.",
      },
    ],
    reason: "You're getting this because recording alerts are on.",
  });

  const smsWhat = `your ${i.isGroup ? "group class" : "session"} with ${coach}`; // short: full topic names can push past one text
  const sms = smsText(`Hi ${i.firstName}, your recording from ${smsWhat} is ready. Watch it here: ${STUDENT_APP_SHORT}`, {
    brandPrefix: false,
  });

  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: "Your recording is ready",
    bellBody: `${i.lessonLabel} with ${coach} · ${i.lessonDate}`,
  };
}
