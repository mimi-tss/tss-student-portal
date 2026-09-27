import type { SupabaseClient } from "@supabase/supabase-js";

// Studio-written parts of the Monday digest (migration 0112, admin →
// Weekly Email).
export interface DigestFeature {
  position: 1 | 2;
  heading: string | null;
  body: string | null;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
}

export interface DigestEvent {
  id: string;
  eventDate: string; // YYYY-MM-DD
  title: string;
}

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function featureIsEmpty(f: DigestFeature): boolean {
  return !f.heading && !f.body && !f.imageUrl && !(f.buttonLabel && f.buttonUrl);
}

export async function getDigestFeatures(admin: SupabaseClient, weekKey: string): Promise<DigestFeature[]> {
  const { data } = await admin
    .from("digest_features")
    .select("position, heading, body, image_url, button_label, button_url")
    .eq("week_start", weekKey)
    .order("position");
  return (data ?? []).map((r) => ({
    position: r.position as 1 | 2,
    heading: clean(r.heading),
    body: clean(r.body),
    imageUrl: clean(r.image_url),
    buttonLabel: clean(r.button_label),
    buttonUrl: clean(r.button_url),
  }));
}

// Everything dated on/after `fromDate` (the digest's Monday), soonest
// first. Capped so a long backlog can't turn the email into a calendar.
export async function getUpcomingEvents(admin: SupabaseClient, fromDate: string, limit = 8): Promise<DigestEvent[]> {
  const { data } = await admin
    .from("digest_events")
    .select("id, event_date, title")
    .gte("event_date", fromDate)
    .order("event_date")
    .limit(limit);
  return (data ?? []).map((r) => ({ id: r.id as string, eventDate: r.event_date as string, title: r.title as string }));
}

// "SEP 29" — the studio's own format for the list.
export function eventDateLabel(eventDate: string): string {
  return new Date(`${eventDate}T12:00:00Z`)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
}
