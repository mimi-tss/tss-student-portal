// Help-center categories — the same `category` values the help articles
// already use (support_kb_articles, check constraint in 0111), with the
// student-facing names and blurbs. Client-safe (no server imports).
export const HELP_CATEGORIES = [
  { key: "login", name: "Getting in", blurb: "Logging in, login codes and access", icon: "🔑" },
  { key: "scheduling", name: "Lessons & scheduling", blurb: "Rescheduling, make-up credits, holidays", icon: "📅" },
  { key: "portal", name: "Using the portal", blurb: "Your dashboard, chat, notifications", icon: "🎤" },
  { key: "kajabi-courses", name: "Courses", blurb: "Finding your courses in Kajabi", icon: "🎓" },
  { key: "kajabi-community", name: "Backstage community", blurb: "The Backstage community in Kajabi", icon: "💬" },
  { key: "billing", name: "Billing & plans", blurb: "Plans, add-ons, pausing or cancelling", icon: "💳" },
  { key: "other", name: "Other", blurb: "Everything else", icon: "✨" },
] as const;

// The private coach help center's categories (/coach/help). "login" is
// shared — logging in works the same for everyone.
export const COACH_HELP_CATEGORIES = [
  { key: "coach-schedule", name: "Calendar & availability", blurb: "Your calendar, hours and time off", icon: "📅" },
  { key: "coach-lessons", name: "Lessons & teaching tools", blurb: "Notes, homework, exercises, recordings", icon: "🎤" },
  { key: "coach-students", name: "Your students", blurb: "Student info and chat", icon: "👥" },
  { key: "coach-pay", name: "Pay & attendance", blurb: "Attendance and payroll", icon: "💵" },
  { key: "login", name: "Getting in", blurb: "Logging in and login codes", icon: "🔑" },
] as const;

export type HelpCategoryKey = (typeof HELP_CATEGORIES)[number]["key"];

export function helpCategory(key: string) {
  return HELP_CATEGORIES.find((c) => c.key === key) ?? COACH_HELP_CATEGORIES.find((c) => c.key === key) ?? null;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// First ~160 chars of an article's text, Markdown stripped — used when an
// article has no summary of its own.
export function plainExcerpt(markdown: string, max = 160): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text;
}
