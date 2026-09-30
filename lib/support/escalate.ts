import type { SupabaseClient } from "@supabase/supabase-js";
import { notifySlack } from "@/lib/slack/notify";
import { sendEmail } from "@/lib/email/send";
import { esc } from "@/lib/email/layout";
import { splitSuggestions } from "@/lib/support/suggestions";
import {
  addMessage,
  loadMessages,
  signAttachmentUrls,
  type SupportThread,
} from "@/lib/support/thread";
import {
  describeOfficeHours,
  isWithinOfficeHours,
  loadSupportSettings,
} from "@/lib/support/settings";

function appUrl(path = "") {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.tarasimonstudios.com"}${path}`;
}

// Mel's handoff pings share the bug-reports channel (studio decision 2026-09-30),
// unless a dedicated SLACK_SUPPORT_WEBHOOK_URL is set; falls back to the
// staff channel like bug reports do.
function supportSlack(text: string) {
  return notifySlack(
    text,
    process.env.SLACK_SUPPORT_WEBHOOK_URL || process.env.SLACK_BUG_REPORTS_WEBHOOK_URL || undefined,
  );
}

async function whoIs(admin: SupabaseClient, thread: SupportThread) {
  if (thread.student_id) {
    const { data } = await admin.from("students").select("name, email, tier").eq("id", thread.student_id).maybeSingle();
    if (data) return { name: data.name as string, email: data.email as string, tier: data.tier as string };
  }
  if (thread.coach_id) {
    const { data } = await admin.from("coaches").select("name, email").eq("id", thread.coach_id).maybeSingle();
    if (data) return { name: data.name as string, email: data.email as string, tier: "Coach" };
  }
  return { name: thread.guest_name ?? "Guest (not logged in)", email: thread.guest_email, tier: null };
}

// Hands a thread to a human. In office hours: joins the queue + Slack
// ping, and the student sees their place in line with an "email us
// instead" option. Outside office hours: straight to info@ by email
// (plus a Slack note), since nobody is watching the queue.
export async function escalateThread(
  admin: SupabaseClient,
  thread: SupportThread,
  reason: string,
  summary: string | null,
): Promise<{ status: SupportThread["status"] }> {
  if (thread.status === "needs_human" || thread.status === "claimed") return { status: thread.status };

  const settings = await loadSupportSettings(admin);
  const now = new Date().toISOString();
  const who = await whoIs(admin, thread);
  const link = appUrl(`/admin/support/${thread.id}`);

  await admin
    .from("support_threads")
    .update({ status: "needs_human", escalated_at: now, escalation_reason: reason, escalation_summary: summary })
    .eq("id", thread.id);
  const escalated: SupportThread = {
    ...thread,
    status: "needs_human",
    escalated_at: now,
    escalation_reason: reason,
    escalation_summary: summary,
  };

  if (isWithinOfficeHours(settings)) {
    await addMessage(admin, {
      threadId: thread.id,
      sender: "system",
      body: `I've asked a person from the studio team to join. You're in line — a team member usually joins within about ${settings.expectedWaitMinutes} minutes. You can keep adding details or screenshots here while you wait.`,
    });
    // The admin portal also pops up an in-app alert for this (components
    // in app/(admin)/support-alert.tsx polls needs_human threads).
    await supportSlack(
      `:raising_hand: Support chat needs a person — ${who.name}${who.tier ? ` (${who.tier})` : ""}\n>${reason}${summary ? `\n>${summary.slice(0, 300)}` : ""}\n${link}`,
    );
    return { status: "needs_human" };
  }

  await emailTranscript(admin, escalated, "after_hours");
  await addMessage(admin, {
    threadId: thread.id,
    sender: "system",
    body: `There are no available agents right now (our hours are ${describeOfficeHours(settings)}). We've emailed this whole conversation to our team, and they'll reply${who.email ? ` to ${who.email}` : ""} by email as soon as they're back.`,
  });
  await supportSlack(`:envelope: After-hours support chat emailed to ${settings.supportEmail} — ${who.name}\n>${reason}\n${link}`);
  return { status: "emailed" };
}

// Full transcript (+ screenshot links, valid 7 days) to the studio inbox,
// reply-to set to the student so admin can answer straight from email.
export async function emailTranscript(
  admin: SupabaseClient,
  thread: SupportThread,
  why: "student_chose_email" | "after_hours" | "admin",
): Promise<void> {
  const settings = await loadSupportSettings(admin);
  const who = await whoIs(admin, thread);
  const messages = await loadMessages(admin, thread.id);
  const paths = messages.map((m) => m.attachment_path).filter((p): p is string => !!p);
  const signed = await signAttachmentUrls(admin, paths, 7 * 24 * 60 * 60);

  const label: Record<string, string> = {
    student: who.name,
    coach: who.name,
    guest: who.name,
    bot: "Mel (AI)",
    admin: "Studio",
    system: "System",
  };
  const whyText = {
    student_chose_email: "The student chose not to wait in the chat queue and asked for an email reply.",
    after_hours: "This chat was escalated outside office hours.",
    admin: "Forwarded from the support inbox by an admin.",
  }[why];

  const rows = messages
    .map((m) => {
      const time = new Date(m.created_at).toLocaleString("en-US", { timeZone: settings.timezone });
      const cleanBody = splitSuggestions(m.body).text;
      const body = cleanBody ? esc(cleanBody).replace(/\n/g, "<br>") : "";
      const action = m.action ? `<br><em>Proposed: ${esc(m.action.label)} — ${esc(m.action.status)}</em>` : "";
      const attachment =
        m.attachment_path && signed[m.attachment_path]
          ? `<br><a href="${signed[m.attachment_path]}">Screenshot / attachment</a>`
          : "";
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap;font:12px Helvetica,Arial;color:#666">${esc(label[m.sender] ?? m.sender)}<br>${esc(time)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font:14px/1.5 Helvetica,Arial;color:#222">${body}${action}${attachment}</td></tr>`;
    })
    .join("");

  const html = `<div style="font:14px/1.5 Helvetica,Arial;color:#222">
<p><strong>${esc(who.name)}</strong>${who.email ? ` &lt;${esc(who.email)}&gt;` : " (no email given)"}${who.tier ? ` · ${esc(who.tier)}` : ""}</p>
<p>${esc(whyText)}</p>
${thread.escalation_reason ? `<p><strong>Reason:</strong> ${esc(thread.escalation_reason)}</p>` : ""}
${thread.escalation_summary ? `<p><strong>Bot summary:</strong> ${esc(thread.escalation_summary)}</p>` : ""}
<p><a href="${appUrl(`/admin/support/${thread.id}`)}">Open in the support inbox</a> · Reply to this email to answer ${who.email ? "them" : "(no email on file)"}.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:12px">${rows}</table>
</div>`;

  await sendEmail(
    settings.supportEmail,
    `Support chat: ${who.name} — ${thread.escalation_reason ?? "needs a reply"}`,
    html,
    who.email ?? undefined,
  );

  await admin.from("support_threads").update({ status: "emailed", emailed_at: new Date().toISOString() }).eq("id", thread.id);
}
