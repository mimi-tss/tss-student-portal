import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedYearMonthDay } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// The digest runs Mondays 12:00 UTC (.github/workflows/weekly-digest.yml)
// and keys its week by that Monday's Eastern date. A blurb written any
// time before then belongs to the coming Monday; one written on a Monday
// after the send belongs to the NEXT Monday.
const DIGEST_HOUR_UTC = 12;

export function nextDigestWeekKey(now: Date = new Date()): string {
  const [y, m, d] = zonedYearMonthDay(now, DEFAULT_TIMEZONE);
  const today = new Date(Date.UTC(y, m - 1, d));
  const dow = today.getUTCDay(); // 1 = Monday
  // Compare against that Monday's actual send instant, not now's UTC hour
  // (Monday evening ET is already Tuesday morning UTC).
  const sentToday = dow === 1 && now.getTime() >= Date.UTC(y, m - 1, d, DIGEST_HOUR_UTC);
  const add = dow === 1 ? (sentToday ? 7 : 0) : (8 - dow) % 7;
  const target = new Date(today.getTime() + add * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

export async function getCommunityNote(admin: SupabaseClient, weekKey: string): Promise<string | null> {
  const { data } = await admin.from("digest_community_notes").select("body").eq("week_start", weekKey).maybeSingle();
  const body = (data?.body as string | undefined)?.trim();
  return body || null;
}
