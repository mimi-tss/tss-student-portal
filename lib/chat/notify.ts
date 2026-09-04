import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { notifySlack } from "@/lib/slack/notify";

const NOTIFY_THROTTLE_MS = 15 * 60 * 1000;

export type ChatSenderRole = "student" | "coach" | "admin";

// Generic "you have a new message" nudge (TSS_App_Spec_1.md section 9) —
// no message content or contact info exposed. No real in-app presence
// signal exists (chat is 4s-polling while mounted, nothing tracks
// "active right now"), so this is throttled to at most one email per
// recipient per thread per 15 minutes rather than a true
// active/inactive check — a deliberate simplification, not full spec
// compliance (see the plan's flagged assumptions).
//
// A thread has exactly two possible recipients, never three — when the
// STUDENT sends, the coach is notified; when the COACH *or* ADMIN sends,
// the student is notified. Confirmed live this used to collapse to a
// boolean (senderIsCoach) that only ever checked "is this a coach" —
// an admin sending a message (posting on the studio's behalf, e.g.
// forwarding a recording link) fell through to the "not a coach" branch
// and was wrongly treated as if the STUDENT had sent it: notified the
// coach's Slack instead of the student's email, and labeled with the
// student's own name as if they'd written it themselves.
function recipientFor(senderRole: ChatSenderRole): "student" | "coach" {
  return senderRole === "student" ? "coach" : "student";
}

// Note: the coach recipient here is always the THREAD's own coach_id,
// not necessarily whoever actually sent the message — a coach without
// current access (via the additive RLS policies, 0022/0092) can no
// longer even send in the first place, but a thread's coach_id is only
// ever its "primary"/most-recently-assigned coach. A group-class coach
// who messages a student whose thread still points at their assigned
// 1:1 coach won't be the one auto-notified on that student's reply —
// same accepted limitation 0022's own "additive access" model already
// carries for any historical/reassigned coach, not something new here.
export async function notifyChatRecipient(
  threadId: string,
  senderRole: ChatSenderRole,
  bodyPreview?: string | null,
) {
  const admin = createAdminClient();
  const { data: thread } = await admin
    .from("chat_threads")
    .select(
      "student_id, coach_id, student_last_notified_at, coach_last_notified_at, students(name, email), coaches(name, email, slack_webhook_url)",
    )
    .eq("id", threadId)
    .single();

  if (!thread) return;

  const recipientRole = recipientFor(senderRole);
  const now = new Date();
  const throttleColumn = recipientRole === "coach" ? "coach_last_notified_at" : "student_last_notified_at";
  const lastNotified = recipientRole === "coach" ? thread.coach_last_notified_at : thread.student_last_notified_at;

  if (lastNotified && now.getTime() - new Date(lastNotified).getTime() < NOTIFY_THROTTLE_MS) {
    return;
  }

  const recipient =
    recipientRole === "coach"
      ? (thread.coaches as unknown as { name: string; email: string; slack_webhook_url: string | null } | null)
      : (thread.students as unknown as { name: string; email: string } | null);
  const senderName =
    senderRole === "coach"
      ? (thread.coaches as unknown as { name: string } | null)?.name
      : senderRole === "student"
        ? (thread.students as unknown as { name: string } | null)?.name
        : "Admin"; // same "no coach/student row = Admin" convention GET's own participants map uses

  if (recipient?.email) {
    await sendEmail(
      recipient.email,
      "New message on Tara Simon Studios",
      `<p>You have a new message from ${senderName ?? "the studio"} — log in to view and reply.</p>`,
    );
  }

  // Coach-facing Slack ping, same throttle as the email above — only
  // when the coach is the actual recipient (i.e. a student sent it).
  if (recipientRole === "coach") {
    const coach = recipient as { slack_webhook_url: string | null } | null;
    if (coach?.slack_webhook_url) {
      const preview = bodyPreview?.trim() ? `: "${bodyPreview.trim().slice(0, 200)}"` : "";
      await notifySlack(`New message from ${senderName ?? "a student"}${preview}`, coach.slack_webhook_url);
    }
  }

  await admin.from("chat_threads").update({ [throttleColumn]: now.toISOString() }).eq("id", threadId);
}
