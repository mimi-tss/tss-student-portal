import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";
import { creditDeadline } from "@/lib/email/templates/lesson-credits";

// Unused group session credits (studio call 2026-10-02): a nudge 3 days
// after a credit is added, and a reminder 7 days before it expires — one
// message per student covering all their group credits. Bootcamps never
// have credits. Follows the student's Lesson credits switch.
export interface GroupCreditLine {
  label: string; // "Group Coaching Session"
  coachFirstName: string | null; // null = any coach
  expiresAt: string | null;
}

export interface UpcomingGroupSession {
  when: string; // "Wed, Oct 7 · 7:00 PM ET"
  coachFirstName: string;
}

function describe(credits: GroupCreditLine[]): string[] {
  const groups = new Map<string, { n: number; c: GroupCreditLine }>();
  for (const c of credits) {
    const key = `${c.label}|${c.coachFirstName ?? ""}|${c.expiresAt ? creditDeadline(c.expiresAt, "short") : ""}`;
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { n: 1, c });
  }
  return [...groups.values()]
    .sort((a, b) => (a.c.expiresAt ?? "9999").localeCompare(b.c.expiresAt ?? "9999"))
    .map(
      ({ n, c }) =>
        `${n} × ${c.label} with ${c.coachFirstName ? `Coach ${c.coachFirstName}` : "any coach"}${
          c.expiresAt ? ` · use by ${creditDeadline(c.expiresAt, "long")}` : ""
        }`,
    );
}

export function groupCredits(i: {
  firstName: string;
  credits: GroupCreditLine[];
  upcoming: UpcomingGroupSession[];
  expiring: boolean;
}) {
  const n = i.credits.length;
  const noun = n === 1 ? "group session credit" : "group session credits";
  const first = i.credits.map((c) => c.expiresAt).filter((d): d is string => !!d).sort()[0] ?? null;
  const firstShort = first ? creditDeadline(first, "short") : null;
  const labels = [...new Set(i.credits.map((c) => c.label))];
  const what = labels.length === 1 ? `${labels[0]} ${n === 1 ? "credit" : "credits"}` : noun;

  const subject = i.expiring
    ? `Your ${noun} ${n === 1 ? "expires" : "expire"} ${firstShort}`
    : `You have ${n === 1 ? "a" : n} ${noun} ready to use`;
  const preheader = firstShort ? `Book by ${firstShort} so you don't lose ${n === 1 ? "it" : "any"}.` : "Pick any upcoming session.";

  const { html, text } = renderEmail({
    preheader,
    heading: i.expiring ? `Your ${noun} ${n === 1 ? "expires" : "expire"} soon, ${i.firstName}` : `Don't forget your ${noun}, ${i.firstName}!`,
    blocks: [
      {
        type: "p",
        text: `You have **${n} ${what}** ready to use.${first ? ` Book ${n === 1 ? "it" : "them"} before ${n === 1 ? "it expires" : "they expire"} so you don't lose ${n === 1 ? "it" : "any"}.` : ""}`,
      },
      { type: "card", title: n === 1 ? "Your credit" : "Your credits", lines: describe(i.credits) },
      ...(i.upcoming.length
        ? [{ type: "card" as const, title: "Coming up", lines: i.upcoming.map((u) => `${u.when} with Coach ${u.coachFirstName}`) }]
        : []),
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      { type: "p", text: "Open **Scheduler** and pick a session. Your credit covers it." },
    ],
    reason: "You're getting this because lesson credit reminders are on.",
  });

  return {
    subject,
    preheader,
    html,
    text,
    sms: smsText(
      `Hi ${i.firstName}, you have ${n === 1 ? "a group session credit" : `${n} group session credits`} waiting${
        firstShort ? ` (use by ${firstShort})` : ""
      }. Pick a session: ${STUDENT_APP_SHORT}`,
      { brandPrefix: false },
    ),
    bellTitle: i.expiring ? "Group session credits expiring" : n === 1 ? "Group session credit to use" : "Group session credits to use",
    bellBody: `${n} × group session${firstShort ? ` · use by ${firstShort}` : ""}`,
  };
}
