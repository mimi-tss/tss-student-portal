import { zonedTimeToUtc } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Pay periods run on studio (Eastern) midnights, but payroll_entries
// stores period_start/period_end as plain dates ("2026-09-01"). Read as
// an instant, a bare date is UTC midnight — 8pm ET the day before —
// which pulls in the prior evening's lessons and drops the last
// evening's. So a bare date → that day's Eastern midnight; a full
// timestamp (the range picker's, or the schedule calendar's own week
// in the coach's zone) passes through untouched.
export function periodBoundary(param: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
  const [y, m, d] = param.split("-").map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, DEFAULT_TIMEZONE).toISOString();
}

// "2026-09-01" → "9/1/2026". With lastDay, the period's exclusive end
// ("2026-10-01") shows as the last day actually covered ("9/30/2026").
export function formatPeriodDate(dateOrIso: string, lastDay = false): string {
  const [y, m, d] = dateOrIso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - (lastDay ? 1 : 0)));
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}
