import { renderEmail, type EmailBlock } from "@/lib/email/layout";
import { STUDENT_APP_URL } from "@/lib/email/links";
import { eventDateLabel, featureIsEmpty, type DigestEvent, type DigestFeature } from "@/lib/digest/content";
import type { LessonCreditLine } from "@/lib/email/templates/lesson-credits";
import { describeCredits } from "@/lib/email/templates/lesson-credits";

export interface DigestLesson {
  when: string; // "Tue, Sep 29 · 4:00 PM ET"
  label: string; // "Private Coaching Session with Coach Nikki"
}

export interface WeeklyDigestInput {
  firstName: string;
  // Shown only when it's a real, still-active streak (>= 2 days, active in
  // the last 2 days) — the caller decides; null = "start a streak" nudge.
  streakDays: number | null;
  thisWeek: DigestLesson[];
  attendedLastWeek: number;
  newRecordingsLastWeek: number;
  homework: { note: string; coachLabel: string } | null;
  exercisesAssigned: number;
  credits: LessonCreditLine[];
  // Studio-written boxes and event list (admin → Weekly Email).
  features: DigestFeature[];
  upcoming: DigestEvent[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Monday "your week ahead" digest (weekly_digest). Email + in-app only.
// Every section hides itself when it has nothing to say.
export function weeklyDigest(i: WeeklyDigestInput) {
  const subject = `${i.firstName}, here's your week ahead`;
  const preheaderParts = [
    i.thisWeek.length ? plural(i.thisWeek.length, "lesson this week", "lessons this week") : "",
    i.newRecordingsLastWeek ? plural(i.newRecordingsLastWeek, "new recording", "new recordings") : "",
    i.streakDays ? `${i.streakDays}-day practice streak` : "",
  ].filter(Boolean);
  const preheader = preheaderParts.length ? preheaderParts.join(" · ") : "Everything for your week in one place.";

  const blocks: EmailBlock[] = [{ type: "p", text: "Here's everything for your week in one place." }];

  blocks.push(
    i.streakDays
      ? {
          type: "card",
          title: "🔥 Practice streak",
          lines: [`${i.streakDays} days in a row`, "Keep it going: open the app each day you practice."],
        }
      : {
          type: "card",
          title: "🔥 Practice streak",
          lines: ["Start a practice streak this week", "Open the app each day you practice and watch it grow."],
        },
  );

  if (i.thisWeek.length) {
    blocks.push({ type: "h2", text: "This week" });
    blocks.push({ type: "list", items: i.thisWeek.map((l) => `**${l.when}**: ${l.label}`) });
  } else {
    blocks.push({ type: "h2", text: "This week" });
    blocks.push({ type: "p", text: "No lessons booked yet this week. Log in to grab a time that works for you." });
  }

  if (i.attendedLastWeek || i.newRecordingsLastWeek) {
    blocks.push({ type: "h2", text: "Last week" });
    blocks.push({
      type: "list",
      items: [
        i.attendedLastWeek ? `✓ ${plural(i.attendedLastWeek, "lesson", "lessons")} attended` : "",
        i.newRecordingsLastWeek
          ? `🎧 ${plural(i.newRecordingsLastWeek, "new recording", "new recordings")} in your folder: watch it back and practice along`
          : "",
      ].filter(Boolean),
    });
  }

  if (i.homework) {
    blocks.push({ type: "h2", text: "From your coach" });
    blocks.push({ type: "quote", text: i.homework.note, from: i.homework.coachLabel });
  }

  if (i.exercisesAssigned) {
    blocks.push({ type: "h2", text: "Practice" });
    blocks.push({
      type: "p",
      text: `You have **${plural(i.exercisesAssigned, "exercise", "exercises")}** assigned. Pick one to do today.`,
    });
  }

  if (i.credits.length) {
    blocks.push({ type: "h2", text: "Lesson credits" });
    blocks.push({ type: "list", items: describeCredits(i.credits) });
  }

  // Up to 2 studio boxes, then the "What's Coming Up" list — each hidden
  // when empty (lib/digest/content.ts).
  for (const f of i.features.filter((f) => !featureIsEmpty(f))) {
    blocks.push({
      type: "feature",
      heading: f.heading,
      body: f.body,
      imageUrl: f.imageUrl,
      button: f.buttonLabel && f.buttonUrl ? { label: f.buttonLabel, url: f.buttonUrl } : null,
    });
  }

  if (i.upcoming.length) {
    blocks.push({ type: "h2", text: "What's coming up" });
    blocks.push({ type: "list", items: i.upcoming.map((e) => `**${eventDateLabel(e.eventDate)}** - ${e.title}`) });
  }

  blocks.push({ type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL });
  blocks.push({ type: "note", text: "See you this week. Your Voice Matters!" });

  const { html, text } = renderEmail({
    preheader,
    heading: `Happy Monday, ${i.firstName}!`,
    blocks,
    reason: "You're getting this because the weekly digest is on.",
  });

  return {
    subject,
    preheader,
    html,
    text,
    sms: "", // digest is never texted
    bellTitle: "Your week ahead",
    bellBody: preheader,
  };
}
