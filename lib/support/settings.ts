import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupportSettings {
  timezone: string;
  officeHours: Record<string, [string, string]>;
  expectedWaitMinutes: number;
  supportEmail: string;
}

const DEFAULTS: SupportSettings = {
  timezone: "America/New_York",
  officeHours: {
    mon: ["09:00", "17:00"],
    tue: ["09:00", "17:00"],
    wed: ["09:00", "17:00"],
    thu: ["09:00", "17:00"],
    fri: ["09:00", "17:00"],
  },
  expectedWaitMinutes: 8,
  supportEmail: "info@tarasimonstudios.com",
};

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS: Record<string, string> = {
  sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
};

// Single-row support_settings (migration 0111). Falls back to defaults
// if the row is somehow missing, so the bot never breaks over config.
export async function loadSupportSettings(admin: SupabaseClient): Promise<SupportSettings> {
  const { data } = await admin.from("support_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULTS;
  return {
    timezone: data.timezone ?? DEFAULTS.timezone,
    officeHours: (data.office_hours as Record<string, [string, string]>) ?? DEFAULTS.officeHours,
    expectedWaitMinutes: data.expected_wait_minutes ?? DEFAULTS.expectedWaitMinutes,
    supportEmail: data.support_email ?? DEFAULTS.supportEmail,
  };
}

function zonedDayAndMinutes(now: Date, timeZone: string): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase();
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isWithinOfficeHours(settings: SupportSettings, now = new Date()): boolean {
  const { day, minutes } = zonedDayAndMinutes(now, settings.timezone);
  const window = settings.officeHours[day];
  if (!window) return false;
  return minutes >= toMinutes(window[0]) && minutes < toMinutes(window[1]);
}

function format12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

// "Mon–Fri 9am–5pm ET"-style summary for the bot + student banners.
// Groups consecutive days that share the same window.
export function describeOfficeHours(settings: SupportSettings): string {
  const groups: { days: string[]; window: string }[] = [];
  for (const day of [...DAY_KEYS.slice(1), "sun"]) {
    const w = settings.officeHours[day];
    const label = w ? `${format12h(w[0])}–${format12h(w[1])}` : null;
    const last = groups[groups.length - 1];
    if (label && last && last.window === label && last.days.length) {
      last.days.push(day);
    } else if (label) {
      groups.push({ days: [day], window: label });
    } else {
      groups.push({ days: [], window: "" });
    }
  }
  const tzLabel = settings.timezone === "America/New_York" ? "ET" : settings.timezone;
  const text = groups
    .filter((g) => g.days.length)
    .map((g) => {
      const first = DAY_LABELS[g.days[0]];
      const lastDay = DAY_LABELS[g.days[g.days.length - 1]];
      return `${g.days.length > 1 ? `${first}–${lastDay}` : first} ${g.window}`;
    })
    .join(", ");
  return text ? `${text} ${tzLabel}` : "by email";
}
