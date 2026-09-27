import { renderEmail, smsText } from "@/lib/email/layout";
import { STUDENT_APP_SHORT, STUDENT_APP_URL } from "@/lib/email/links";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

export interface LessonCreditLine {
  durationMinutes: number;
  expiresAt: string | null;
}

export interface LessonCreditsInput {
  firstName: string;
  credits: LessonCreditLine[];
  // true = the "expires within 7 days" reminder; false = the "you got a
  // credit, go book it" nudge a few days after it was issued.
  expiring: boolean;
}

// Dates are shown in the studio's zone (Eastern, DEFAULT_TIMEZONE). Expiry
// is stored as "end of day" but was entered from a Mountain-time browser
// (…T05:59:59Z = ~2 AM ET the NEXT morning), so a plain ET date would
// promise a day the booking check (slot start < expires_at) won't honor.
// Anything expiring before 6 AM ET counts as the previous day — the last
// day a lesson can actually start.
const EARLY_MORNING_MS = 6 * 60 * 60 * 1000;

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(new Date(iso).getTime() - EARLY_MORNING_MS);
  // Add the year when it isn't this year — a 1-year pack credit's
  // "book by Sunday, Sep 26" would otherwise read like this weekend.
  const needsYear = opts.day && !opts.year && d.getUTCFullYear() !== new Date().getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, ...opts, ...(needsYear ? { year: "numeric" } : {}) }).format(d);
}

function groupCredits(credits: LessonCreditLine[]) {
  const groups = new Map<string, { count: number; durationMinutes: number; expiresAt: string | null }>();
  for (const c of credits) {
    const day = c.expiresAt ? fmt(c.expiresAt, { year: "numeric", month: "numeric", day: "numeric" }) : "none";
    const key = `${c.durationMinutes}|${day}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { count: 1, durationMinutes: c.durationMinutes, expiresAt: c.expiresAt });
  }
  return [...groups.values()].sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
}

// "2 × 30-minute lessons · book by Thursday, Dec 31" — shared with the
// weekly digest's credits section.
export function describeCredits(credits: LessonCreditLine[]): string[] {
  return groupCredits(credits).map(
    (g) =>
      `${g.count} × ${g.durationMinutes}-minute ${g.count === 1 ? "lesson" : "lessons"}${
        g.expiresAt ? ` · book by ${fmt(g.expiresAt, { weekday: "long", month: "short", day: "numeric" })}` : ""
      }`,
  );
}

function soonest(credits: LessonCreditLine[]): string | null {
  const dates = credits.map((c) => c.expiresAt).filter((d): d is string => !!d).sort();
  return dates[0] ?? null;
}

// Unbooked lesson credits (makeup_credit_needs_scheduling). Students see
// "lesson credit", never the internal credit type — most are purchased
// add-on lessons, not makeups. Text follows the student's Alerts → Text
// setting like every other alert.
// Copy approved by the studio 2026-09-26.
export function lessonCredits(i: LessonCreditsInput) {
  const n = i.credits.length;
  const noun = n === 1 ? "lesson credit" : "lesson credits";
  const first = soonest(i.credits);
  const firstLong = first ? fmt(first, { weekday: "long", month: "short", day: "numeric" }) : null;
  const firstShort = first ? fmt(first, { month: "short", day: "numeric" }) : null;

  const subject = i.expiring
    ? `Your ${noun} ${n === 1 ? "expires" : "start expiring"} ${firstShort}`
    : n === 1
      ? "You have a lesson credit waiting to be booked"
      : `You have ${n} lesson credits waiting to be booked`;
  const preheader = firstLong ? `Book by ${firstLong} so you don't lose it.` : "Pick any open time that works for you.";

  const summary =
    n === 1
      ? `**1 lesson credit** (${i.credits[0].durationMinutes} min)`
      : `**${n} lesson credits**`;

  const { html, text } = renderEmail({
    preheader,
    heading: i.expiring ? `Your ${noun} ${n === 1 ? "expires" : "expire"} soon, ${i.firstName}` : `Don't forget your ${noun}, ${i.firstName}!`,
    blocks: [
      {
        type: "p",
        text: i.expiring
          ? `You still have ${summary} to use. Book ${n === 1 ? "it" : "them"} before ${firstLong} so you don't lose ${n === 1 ? "it" : "any"}.`
          : `You have ${summary} ready to use.${first ? ` Book ${n === 1 ? "it" : "them"} before ${n === 1 ? "it expires" : "they expire"} so you don't lose ${n === 1 ? "it" : "any"}.` : ""}`,
      },
      {
        type: "card",
        title: n === 1 ? "Your credit" : "Your credits",
        // Identical credits (same length + same book-by day) collapse into
        // one "2 × 30-minute lessons" line, soonest deadline first.
        lines: describeCredits(i.credits),
      },
      { type: "button", label: "LOG IN TO THE SING SMARTER APP", url: STUDENT_APP_URL },
      { type: "p", text: "Pick any open time that works for you. It only takes a minute." },
    ],
    reason: "You're getting this because lesson credit reminders are on.",
  });

  const minutes = [...new Set(i.credits.map((c) => c.durationMinutes))].join("/");
  return {
    subject,
    preheader,
    html,
    text,
    // Sent only if the student turned on Alerts → Text (one of the few
    // text-eligible kinds — SMS_KINDS in lib/notifications/create.ts).
    sms: smsText(
      i.expiring
        ? `Hi ${i.firstName}, your ${noun} ${n === 1 ? "expires" : "start expiring"} ${firstShort}. Book before you lose ${n === 1 ? "it" : "them"}: ${STUDENT_APP_SHORT}`
        : `Hi ${i.firstName}, you have ${n === 1 ? "a lesson credit" : `${n} lesson credits`} waiting to be booked${firstShort ? ` (book by ${firstShort})` : ""}. Log in: ${STUDENT_APP_SHORT}`,
      { brandPrefix: false },
    ),
    bellTitle: i.expiring ? (n === 1 ? "Lesson credit expiring" : "Lesson credits expiring") : n === 1 ? "Lesson credit to book" : "Lesson credits to book",
    bellBody: `${n} × ${minutes} min${firstShort ? ` · book by ${firstShort}` : ""}`,
  };
}
