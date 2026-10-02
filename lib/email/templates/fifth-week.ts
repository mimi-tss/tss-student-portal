import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";

// "Bonus week" offer (fifth_week_offer): the student's billing cycle has a
// 5th occurrence of their lesson day, not covered by the 4-lesson plan.
// Sent 7 days ahead, reminder 2 days ahead if they haven't added it
// (app/api/cron/fifth-week-offers). Buying happens from the "Add this
// lesson" card on the student dashboard. Studio-approved flow 2026-09-26.
export function fifthWeekOffer(i: {
  firstName: string;
  coachFirstName: string;
  lessonDate: string; // "Tuesday, Oct 27"
  lessonShortDate: string; // "Oct 27"
  lessonDay: string; // "Tue"
  lessonWeekday: string; // "Tuesday"
  lessonTime: string; // "4:00 PM ET"
  durationMinutes: number;
  priceLabel: string | null; // "$45" — null if the price couldn't be read
  reminder: boolean;
}) {
  const coach = `Coach ${i.coachFirstName}`;
  const price = i.priceLabel ? ` for ${i.priceLabel}` : "";
  const subject = i.reminder
    ? `Last chance: add your bonus lesson on ${i.lessonShortDate}`
    : `Want an extra lesson on ${i.lessonShortDate}?`;
  const preheader = `This billing month has 5 ${i.lessonWeekday}s. Add a lesson on the 5th one if you'd like.`;

  const { html, text } = renderEmail({
    preheader,
    heading: i.reminder ? `Still time to add it, ${i.firstName}!` : `Want an extra lesson, ${i.firstName}?`,
    blocks: [
      {
        type: "p",
        text: `Your plan includes 4 lessons each billing month, and this one has **5 ${i.lessonWeekday}s**. If you'd like, you can add a lesson on the 5th one at your usual time with **${coach}**${price}.`,
      },
      {
        type: "card",
        title: "Extra lesson",
        lines: [`${i.lessonDate} · ${i.lessonTime}`, `Private ${i.durationMinutes}-min Coaching Session with ${coach}${price}`],
      },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      {
        type: "p",
        text: "Open your portal and tap **Add this lesson** on your dashboard. Your card on file is charged and the lesson is booked in your usual time.",
      },
      { type: "note", text: "Totally optional. If you skip it, there's just no lesson that week." },
    ],
    reason: "You're getting this because lesson alerts are on.",
  });

  const sms = smsText(
    `Hi ${i.firstName}, this month has 5 ${i.lessonWeekday}s. Want an extra lesson with ${coach} on ${i.lessonShortDate}? Add it in the app: ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );

  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: i.reminder ? "Extra lesson: last chance to add it" : "Want an extra lesson this month?",
    bellBody: `${i.lessonDay}, ${i.lessonShortDate} · ${i.lessonTime} with ${coach}${price}`,
  };
}

// Tara's students: no bonus lesson that week, just a heads-up so they
// don't show up expecting one (studio call 2026-09-26). Sent once, 7 days
// ahead.
export function fifthWeekNoLesson(i: {
  firstName: string;
  coachFirstName: string;
  lessonDate: string;
  lessonShortDate: string;
  lessonDay: string;
  lessonWeekday: string;
}) {
  const coach = `Coach ${i.coachFirstName}`;
  const subject = `No lesson on ${i.lessonDay}, ${i.lessonShortDate}`;
  const preheader = `Your billing cycle has an extra ${i.lessonWeekday}. See you the week after!`;
  const { html, text } = renderEmail({
    preheader,
    heading: `Quick heads-up, ${i.firstName}`,
    blocks: [
      {
        type: "p",
        text: `This billing cycle has an extra ${i.lessonWeekday}, and your plan covers 4 lessons per cycle, so there's **no lesson with ${coach} on ${i.lessonDate}**.`,
      },
      { type: "p", text: "We'll see you the following week at your usual time. Keep practicing in the meantime!" },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
    ],
    reason: "You're getting this because lesson alerts are on.",
  });
  const sms = smsText(
    `Hi ${i.firstName}, heads-up: no lesson with ${coach} on ${i.lessonDay}, ${i.lessonShortDate} (extra week in your billing cycle). See you the week after!`,
    { brandPrefix: false },
  );
  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: `No lesson on ${i.lessonShortDate}`,
    bellBody: `Extra ${i.lessonWeekday} in your billing cycle · see you the week after`,
  };
}
