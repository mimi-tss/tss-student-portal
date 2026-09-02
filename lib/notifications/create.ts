import { SupabaseClient } from "@supabase/supabase-js";
import { notifyGhl, type GhlEvent } from "@/lib/ghl/notify";
import { notifySlack } from "@/lib/slack/notify";

type NotificationGroup = "digest" | "alerts";
type NotificationKind =
  | "session_starting_soon"
  | "session_reminder_24h"
  | "recording_ready"
  | "makeup_credit_needs_scheduling"
  | "weekly_digest";

// Claims a dedup_key in notification_log — returns false (already sent)
// on a unique-violation, true if this call is the one that gets to send.
// No RPC needed: notification_log's unique index is plain, not partial
// (see migration 0083's header comment), so a caught 23505 is enough,
// unlike attention_items.
async function claim(
  admin: SupabaseClient,
  recipientType: "student" | "coach" | "staff",
  recipientId: string | null,
  kind: string,
  dedupKey: string,
): Promise<boolean> {
  const { error } = await admin
    .from("notification_log")
    .insert({ recipient_type: recipientType, recipient_id: recipientId, kind, dedup_key: dedupKey });

  if (!error) return true;
  if (error.code === "23505") return false; // already sent — not a real failure
  console.error(`notification_log claim failed for ${kind}:${dedupKey}`, error.message);
  return false; // fail closed — better to skip once than double-send on a real DB error
}

interface StudentNotifyInput {
  studentId: string;
  email: string;
  phone: string | null;
  group: NotificationGroup;
  kind: NotificationKind;
  dedupKey: string;
  title: string;
  body: string;
  linkUrl?: string;
  ghlData: Record<string, unknown>;
  channels: { email: boolean; sms: boolean; inApp: boolean };
}

// Student-facing notification: claims dedup, writes the in-app row only
// if that channel is enabled, and fires the GHL webhook with whichever of
// email/sms this student has turned on for the event's group. All three
// channels share one dedup claim, so a student who has both email and
// in-app enabled still only gets one "already sent" outcome per event —
// not a separate race per channel.
export async function notifyStudent(admin: SupabaseClient, input: StudentNotifyInput): Promise<void> {
  const claimed = await claim(admin, "student", input.studentId, input.kind, input.dedupKey);
  if (!claimed) return;

  if (input.channels.inApp) {
    const { error } = await admin.from("notifications").insert({
      student_id: input.studentId,
      group_key: input.group,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link_url: input.linkUrl ?? null,
    });
    if (error) console.error(`notifications insert failed for student ${input.studentId}`, error.message);
  }

  const channels: GhlEvent["channels"] = [];
  if (input.channels.email) channels.push("email");
  if (input.channels.sms) channels.push("sms");

  if (channels.length > 0) {
    await notifyGhl({
      event: input.kind,
      studentId: input.studentId,
      email: input.email,
      phone: input.phone,
      channels,
      data: input.ghlData,
    });
  }
}

// Coach-facing Slack ping, to that coach's own channel. Skips silently
// (still claims the dedup row, so it never retries) when the coach has no
// slack_webhook_url set — deliberately does NOT fall back to the shared
// staff channel, so an unconfigured coach's personal notifications never
// land somewhere wrong.
export async function notifyCoach(
  admin: SupabaseClient,
  opts: { coachId: string; coachSlackWebhookUrl: string | null; kind: string; dedupKey: string; text: string },
): Promise<void> {
  const claimed = await claim(admin, "coach", opts.coachId, opts.kind, opts.dedupKey);
  if (!claimed) return;
  if (!opts.coachSlackWebhookUrl) return;
  await notifySlack(opts.text, opts.coachSlackWebhookUrl);
}

// Staff-facing Slack ping to the shared ops channel (default
// SLACK_WEBHOOK_URL). recipientId is always null — one shared channel,
// not a per-recipient one.
export async function notifyStaff(
  admin: SupabaseClient,
  opts: { kind: string; dedupKey: string; text: string },
): Promise<void> {
  const claimed = await claim(admin, "staff", null, opts.kind, opts.dedupKey);
  if (!claimed) return;
  await notifySlack(opts.text);
}
