// Outbound webhook to GoHighLevel — the studio's primary comms platform
// (marketing, nurture, funnels, SMS already live there). This app's job is
// only to fire the event; GHL's own workflow builder (studio-configured,
// not part of this codebase) owns the actual email/SMS template, send, and
// per-channel branching on the `event` field. One URL for every event
// type, not one per event — simpler to maintain, and matches how the
// workflow gets built on GHL's side (conditional steps on one trigger).
//
// Same best-effort posture as lib/slack/notify.ts: never throws, so a GHL
// outage can never break a cron run or block the caller.
export interface GhlEvent {
  event:
    | "session_starting_soon"
    | "session_reminder_24h"
    | "recording_ready"
    | "makeup_credit_needs_scheduling"
    | "weekly_digest";
  studentId: string;
  email: string;
  phone: string | null;
  // Which channels this student has enabled for this event's group
  // (notify_alerts_* / notify_digest_* on students) — GHL's workflow
  // should only act on the channels listed here.
  channels: ("email" | "sms")[];
  data: Record<string, unknown>;
}

export async function notifyGhl(event: GhlEvent) {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url || event.channels.length === 0) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // swallow — GHL delivery is best-effort, same posture as Slack
  }
}
