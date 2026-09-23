import { formatTimeInZone } from "@/lib/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

// Pre-formatted merge fields for GHL email/SMS templates. GHL's workflow
// builder can't reliably reformat a raw ISO timestamp into a friendly,
// timezone-correct string, so every student-facing event sends these
// ready to drop straight into a template ({{inboundWebhookRequest.firstName}}
// etc.). Students have no timezone of their own, so lesson times use the
// coach's zone with its label ("4:00 PM ET") — same convention the rest
// of the app uses when showing a lesson time to anyone.

export function firstNameOf(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || "there";
}

export function lessonTimeFields(scheduledAt: string, timeZone: string | null | undefined) {
  const tz = timeZone || DEFAULT_TIMEZONE;
  return {
    // "Tuesday, Sep 23"
    lessonDate: new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date(scheduledAt)),
    // "Tue"
    lessonDay: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(scheduledAt)),
    // "4:00 PM ET"
    lessonTime: formatTimeInZone(scheduledAt, tz),
  };
}

export function portalUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.tarasimonstudios.com"}${path}`;
}
