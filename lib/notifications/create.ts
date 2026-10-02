import { SupabaseClient } from "@supabase/supabase-js";
import { notifyGhl, type GhlEvent } from "@/lib/ghl/notify";
import { notifySlack } from "@/lib/slack/notify";
import { sendEmail } from "@/lib/email/send";
import { STUDENT_NOTIFICATIONS_PAUSED } from "@/lib/notifications/pause";

type NotificationGroup = "digest" | "alerts";
type NotificationKind =
  | "session_starting_soon"
  | "session_reminder_24h"
  | "recording_ready"
  | "makeup_credit_needs_scheduling"
  | "weekly_digest"
  | "group_lesson_cancelled"
  | "chat_message"
  | "session_booked"
  | "group_session_booked"
  | "session_cancelled"
  | "fifth_week_offer"
  | "plan_changed"
  | "session_missed"
  | "payment_failed"
  | "trial_upgrade_offer";

// The only notifications that may go out by text (studio call
// 2026-09-26). Coach messages, recordings and the digest are never
// texted, even for a student with texts on. Enforced here so no call
// site can drift.
const SMS_KINDS: ReadonlySet<NotificationKind> = new Set([
  "session_reminder_24h",
  "session_starting_soon",
  "makeup_credit_needs_scheduling",
  "group_lesson_cancelled",
  "session_booked",
  "group_session_booked",
  "session_cancelled",
  "fifth_week_offer",
  "session_missed",
  "payment_failed",
]);

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

// Which per-topic switch (students.notify_<topic>_email/_sms, migration
// 0119) governs each kind — studio call 2026-09-30. A missed lesson's
// email is always sent (emailAlways at the call site); its text follows
// Bookings. plan_changed has no switch (membership email, always sent).
type Topic = "reminders" | "bookings" | "credits" | "messages" | "recordings" | "digest";
const TOPIC: Partial<Record<NotificationKind, Topic>> = {
  session_reminder_24h: "reminders",
  session_starting_soon: "reminders",
  session_booked: "bookings",
  group_session_booked: "bookings",
  session_cancelled: "bookings",
  group_lesson_cancelled: "bookings",
  fifth_week_offer: "bookings",
  session_missed: "bookings",
  makeup_credit_needs_scheduling: "credits",
  chat_message: "messages",
  recording_ready: "recordings",
  weekly_digest: "digest",
};
const TOPIC_PREF_COLUMNS =
  "notify_reminders_email, notify_reminders_sms, notify_bookings_email, notify_bookings_sms, notify_credits_email, notify_credits_sms, notify_messages_email, notify_recordings_email, notify_digest_email";

// The student's per-topic email/text choice for this kind, or null to
// fall back to the caller's channels (kind has no topic, or migration
// 0119 isn't applied yet).
async function topicChannels(admin: SupabaseClient, studentId: string, kind: NotificationKind) {
  const topic = TOPIC[kind];
  if (!topic) return null;
  const { data, error } = await admin.from("students").select(TOPIC_PREF_COLUMNS).eq("id", studentId).maybeSingle();
  if (error || !data) return null;
  const prefs = data as unknown as Record<string, boolean | undefined>;
  return { email: prefs[`notify_${topic}_email`] === true, sms: prefs[`notify_${topic}_sms`] === true };
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
  // Fallback only: email/sms are decided by the student's per-topic
  // switches (topicChannels) whenever the kind has a topic.
  channels: { email: boolean; sms: boolean; inApp: boolean };
  // Purchases, credits added, missed lessons: the email goes out even if
  // that topic's email switch is off. Text still follows the switch.
  emailAlways?: boolean;
}

// Student-facing notification: claims dedup, writes the in-app row only
// if that channel is enabled, emails via Resend, and fires the GHL webhook
// for SMS if the student turned texts on. All three
// channels share one dedup claim, so a student who has both email and
// in-app enabled still only gets one "already sent" outcome per event —
// not a separate race per channel.
export async function notifyStudent(admin: SupabaseClient, input: StudentNotifyInput): Promise<void> {
  // Paused: skip before claiming dedup, so nothing is marked "sent".
  if (STUDENT_NOTIFICATIONS_PAUSED) return;
  const claimed = await claim(admin, "student", input.studentId, input.kind, input.dedupKey);
  if (!claimed) return;

  const topic = await topicChannels(admin, input.studentId, input.kind);
  const wantEmail = input.emailAlways || (topic ? topic.email : input.channels.email);
  const wantSms = topic ? topic.sms : input.channels.sms;

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

  // EMAIL goes straight out via Resend using the finished design every
  // caller puts in ghlData (subject/html/text) — studio call 2026-09-28,
  // so emails work without a GHL workflow. GHL is now only used for TEXT.
  if (wantEmail) {
    const d = input.ghlData as { subject?: unknown; html?: unknown; text?: unknown };
    if (typeof d.subject === "string" && typeof d.html === "string" && input.email) {
      try {
        await sendEmail(input.email, d.subject, d.html, undefined, typeof d.text === "string" ? d.text : undefined);
      } catch (err) {
        console.error(`student email failed (${input.kind}) for ${input.studentId}`, err);
      }
    } else {
      console.error(`student email skipped (${input.kind}): no rendered subject/html in payload`);
    }
  }

  const channels: GhlEvent["channels"] = [];
  if (wantSms && SMS_KINDS.has(input.kind)) channels.push("sms");

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

// Staff email (e.g. the daily ops digest). Same notification_log dedup as
// notifyStaff, so a re-run within the day is a no-op.
export async function emailStaff(
  admin: SupabaseClient,
  opts: { kind: string; dedupKey: string; to: string; subject: string; html: string; text: string },
): Promise<boolean> {
  const claimed = await claim(admin, "staff", null, opts.kind, opts.dedupKey);
  if (!claimed) return false;
  await sendEmail(opts.to, opts.subject, opts.html, undefined, opts.text);
  return true;
}
