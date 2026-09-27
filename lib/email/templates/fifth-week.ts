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
    : `Bonus week! Add an extra lesson on ${i.lessonShortDate}`;
  const preheader = `Your cycle has an extra ${i.lessonWeekday}. Keep your momentum going with ${coach}.`;

  const { html, text } = renderEmail({
    preheader,
    heading: i.reminder ? `Still time to add it, ${i.firstName}!` : `Bonus week, ${i.firstName}!`,
    blocks: [
      {
        type: "p",
        text: `This billing cycle has an extra ${i.lessonWeekday}, so your usual lesson time with **${coach}** is open. Want to keep your momentum going? Add this lesson${price}.`,
      },
      {
        type: "card",
        title: "Bonus lesson",
        lines: [`${i.lessonDate} · ${i.lessonTime}`, `${i.durationMinutes} minutes with ${coach}${price}`],
      },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      {
        type: "p",
        text: "Open your portal and tap **Add this lesson** on your dashboard. Your card on file is charged and the lesson is booked in your usual time.",
      },
      { type: "note", text: "Not this time? No problem, just ignore this email." },
    ],
    reason: "You're getting this because lesson alerts are on.",
  });

  const sms = smsText(
    `Hi ${i.firstName}, bonus week! Your usual ${i.lessonDay} ${i.lessonTime} slot with ${coach} is open on ${i.lessonShortDate}. Add it in the app: ${STUDENT_APP_SHORT}`,
    { brandPrefix: false },
  );

  return {
    subject,
    preheader,
    html,
    text,
    sms,
    bellTitle: i.reminder ? "Bonus lesson: last chance" : "Bonus week! Add an extra lesson",
    bellBody: `${i.lessonDay}, ${i.lessonShortDate} · ${i.lessonTime} with ${coach}${price}`,
  };
}
