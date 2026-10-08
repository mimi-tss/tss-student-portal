import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { paidThroughEnd } from "@/lib/scheduling/recurring";
import { GET as upcomingGET } from "@/app/api/sessions/upcoming/route";
import { GET as slotsGET } from "@/app/api/booking/slots/route";
import { type SupportAction, type SupportCaller, type SupportThread } from "@/lib/support/thread";
import { escalateThread } from "@/lib/support/escalate";

// Everything the bot can look up or propose. Read tools run as the
// student (their own session, so RLS + the existing routes' own
// ownership checks apply — the upcoming/slots route handlers are called
// directly, in this same request context, so they see the same auth
// cookie). Write tools never write: they post a Confirm card, and only
// the student's own click runs it (app/api/support/confirm).

// Per-topic switches (migration 0119) — same keys the account page and
// /api/notifications/preferences use.
const NOTIFY_KEYS = [
  "notify_reminders_email",
  "notify_reminders_sms",
  "notify_bookings_email",
  "notify_bookings_sms",
  "notify_credits_email",
  "notify_credits_sms",
  "notify_messages_email",
  "notify_recordings_email",
  "notify_digest_email",
] as const;
const TOPIC_NAMES: Record<string, string> = {
  reminders: "Lesson reminders",
  bookings: "Bookings & changes",
  credits: "Lesson credits",
  messages: "Messages from your coach",
  recordings: "Recordings",
  digest: "Weekly digest",
};

const escalateTool: Anthropic.Tool = {
  name: "escalate_to_human",
  description:
    "LAST RESORT: hand this conversation to a person on the studio team. Only when staff must check/change something you can't, money disputes/refunds, complaints or urgent/sensitive issues, or you've tried at least 2 different fixes and it's still unsolved. Never for how-to questions the articles answer or things your tools can do. For a guest (not logged in) you MUST have their name and email first — ask for them, then call this with guest_name and guest_email.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Short reason, e.g. 'Login code never arrives'." },
      summary: { type: "string", description: "2-4 sentence summary for staff: what they need, what was tried." },
      guest_name: { type: "string" },
      guest_email: { type: "string" },
    },
    required: ["reason", "summary"],
  },
};

const studentTools: Anthropic.Tool[] = [
  {
    name: "get_my_account",
    description: "The student's plan tier, subscription status, lesson length, coach, billing period.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_upcoming_lessons",
    description: "The student's upcoming scheduled 1:1 lessons (with session ids) and group lessons in the current paid period.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_credits",
    description: "The student's unused make-up credits (ids, type, expiry, length).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_open_slots",
    description:
      "Open times with the student's coach. Always pass the make-up credit id they'd use (booking requires a credit). Returns up to 40 slots.",
    input_schema: {
      type: "object",
      properties: {
        credit_id: { type: "string" },
        from_date: { type: "string", description: "YYYY-MM-DD, default today" },
        days: { type: "integer", description: "How many days to look ahead, 1-30, default 14" },
      },
      required: ["credit_id"],
    },
  },
  {
    name: "get_my_notification_settings",
    description:
      "Current portal notification settings, per topic: lesson reminders, bookings & changes, lesson credits (each email + text); coach messages, recordings, weekly digest (email only). Purchases, membership and missed-lesson emails are always sent. The in-app bell is always on.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_cancel_lesson",
    description:
      "Show the student a Confirm button to cancel one lesson. Does NOT cancel by itself. First tell them whether they'd get a make-up credit (24h+ notice) or not.",
    input_schema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "propose_book_lesson",
    description: "Show the student a Confirm button to book a make-up lesson at a slot start (from get_open_slots) using a credit.",
    input_schema: {
      type: "object",
      properties: {
        slot_start: { type: "string", description: "ISO start from get_open_slots" },
        credit_id: { type: "string" },
      },
      required: ["slot_start", "credit_id"],
    },
  },
  {
    name: "propose_notification_change",
    description: "Show the student a Confirm button to change portal notification settings. Only include keys that change.",
    input_schema: {
      type: "object",
      properties: Object.fromEntries(NOTIFY_KEYS.map((k) => [k, { type: "boolean" }])),
    },
  },
  escalateTool,
];

const askGuestContactTool: Anthropic.Tool = {
  name: "ask_guest_contact",
  description:
    "Guests only: when a person from the team is needed, call this instead of asking for name/email in text. Shows a simple 2-step form (name, then email); once they fill it in, the chat is handed to the team automatically with your reason + summary.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Short reason, e.g. 'Login code never arrives'." },
      summary: { type: "string", description: "2-4 sentence summary for staff: what they need, what was tried." },
    },
    required: ["reason", "summary"],
  },
};

const lookupAccountTool: Anthropic.Tool = {
  name: "lookup_account",
  description:
    "Guests only (not logged in): check the email they signed up with. Returns whether an account exists and whether it can use the portal. Ask for their email FIRST when they can't log in or ask about their own account. Max 3 checks per chat.",
  input_schema: {
    type: "object",
    properties: { email: { type: "string" } },
    required: ["email"],
  },
};

const closeChatTool: Anthropic.Tool = {
  name: "close_chat",
  description:
    "Close the chat as solved. ONLY after the person has confirmed their issue is solved (e.g. they tapped 'Yes, all sorted'). They'll be asked to rate the chat.",
  input_schema: { type: "object", properties: {} },
};

const MAX_ACCOUNT_LOOKUPS = 3;

export function toolsFor(caller: SupportCaller): Anthropic.Tool[] {
  if (caller.kind === "student") return [...studentTools, closeChatTool];
  // Coaches: explain + hand off to the admin; no student account tools.
  if (caller.kind === "coach") return [escalateTool, closeChatTool];
  return [lookupAccountTool, askGuestContactTool, escalateTool, closeChatTool];
}

export interface ToolContext {
  admin: SupabaseClient;
  caller: SupportCaller;
  thread: SupportThread;
  timeZone: string;
  origin: string;
  escalated: boolean;
  pendingActions: { text: string; action: SupportAction }[];
}

function fmt(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

async function callRoute(
  handler: (req: NextRequest) => Promise<Response>,
  origin: string,
  path: string,
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await handler(new NextRequest(new URL(path, origin)));
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

// Queued, not saved yet — the bot's own reply text is saved first, then
// the card, so the Confirm button always sits at the bottom of the chat.
async function proposeAction(ctx: ToolContext, action: Omit<SupportAction, "status">, text: string) {
  if (ctx.pendingActions.length > 0) return "Error: only one action at a time — ask them to confirm the first one.";
  ctx.pendingActions.push({ text, action: { ...action, status: "pending" } });
  return "A Confirm card is now showing to the student. Tell them briefly to tap Confirm (or Not now). Do not claim it is done.";
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const { caller } = ctx;

  if (name === "close_chat") {
    const now = new Date().toISOString();
    await ctx.admin
      .from("support_threads")
      .update({ status: "resolved", resolved_by: "student", resolved_at: now })
      .eq("id", ctx.thread.id)
      .eq("status", "bot");
    ctx.thread.status = "resolved";
    return "Chat closed. Say a short, warm goodbye (one sentence) — they'll see a rating prompt. No options line.";
  }

  if (name === "lookup_account") {
    if (caller.kind !== "guest") return "Error: they're logged in — you already know their account.";
    if (ctx.thread.account_lookups >= MAX_ACCOUNT_LOOKUPS) {
      return "Error: too many email checks in this chat. Offer to pass it to the team (ask_guest_contact).";
    }
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Error: that doesn't look like an email address — ask them to check it.";
    ctx.thread.account_lookups += 1;
    await ctx.admin
      .from("support_threads")
      .update({ account_lookups: ctx.thread.account_lookups, guest_email: email })
      .eq("id", ctx.thread.id);
    ctx.thread.guest_email = email;
    // Case-insensitive exact match: escape ilike wildcards (emails often
    // contain "_").
    const likeExact = email.replace(/[\\%_]/g, (c) => `\\${c}`);

    const [{ data: student }, { data: coach }] = await Promise.all([
      ctx.admin.from("students").select("tier, subscription_status, archived").ilike("email", likeExact).maybeSingle(),
      ctx.admin.from("coaches").select("id").ilike("email", likeExact).maybeSingle(),
    ]);
    const note =
      "PRIVACY: this person isn't logged in, so you can't be sure the email is theirs. You may tell them only whether this email can log in to the portal (the login page shows that too). NEVER say the plan name, subscription status or any other account detail.";
    // Staff emails get the same answer as any portal account — never
    // reveal to a logged-out visitor that an email belongs to a coach.
    if (coach) {
      return JSON.stringify({
        found: true,
        can_use_portal: true,
        note: `${note} This email can use the portal — help with the code steps (spam folder, newest code, typo, private browsing).`,
      });
    }
    if (!student) {
      return JSON.stringify({
        found: false,
        note: `${note} No account uses this email — likely a typo or a different signup email. Ask them to check the spelling or try another email they might have used.`,
      });
    }
    const canUse = student.tier !== "lite" && !student.archived;
    return JSON.stringify({
      found: true,
      can_use_portal: canUse,
      for_your_reasoning_only: { plan: student.tier, subscription_status: student.subscription_status, archived: student.archived },
      note: canUse
        ? `${note} This email can use the portal — first check they are in a web browser (Safari/Chrome at app.tarasimonstudios.com), NOT an app downloaded from the App Store/Google Play, which can't open Coaching Studio. Then the code steps (spam folder, newest code, typo, private browsing).`
        : `${note} This email can't use Coaching Studio (Lite plans don't include it; My Library and Backstage are still in the Sing Smarter App at app.tarasimonstudios.com). Explain gently without naming their plan, and point them to My Library and Backstage in the Sing Smarter App. If they believe they should have portal access, offer a person.`,
    });
  }

  if (name === "ask_guest_contact") {
    if (caller.kind !== "guest") return "Error: logged-in students don't need this — use escalate_to_human.";
    // Remember why, so the form's submit can hand off with the bot's own
    // reason + summary (app/api/support/escalate).
    await ctx.admin
      .from("support_threads")
      .update({ escalation_reason: String(input.reason ?? "Needs help"), escalation_summary: String(input.summary ?? "") || null })
      .eq("id", ctx.thread.id);
    await proposeAction(ctx, { kind: "contact_request", params: {}, label: "So the team can reach you" }, "");
    return "A simple form asking for their name, then email, is now showing below your reply. In one short sentence, ask them to fill it in. Don't mention Confirm buttons and don't add an options line.";
  }

  if (name === "escalate_to_human") {
    if (caller.kind === "guest") {
      const email = String(input.guest_email ?? ctx.thread.guest_email ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return "Error: for a guest, call ask_guest_contact instead.";
      await ctx.admin
        .from("support_threads")
        .update({ guest_name: String(input.guest_name ?? "").trim() || null, guest_email: email })
        .eq("id", ctx.thread.id);
      ctx.thread.guest_email = email;
      ctx.thread.guest_name = String(input.guest_name ?? "").trim() || null;
    }
    const { status } = await escalateThread(ctx.admin, ctx.thread, String(input.reason ?? "Needs help"), String(input.summary ?? "") || null);
    ctx.escalated = true;
    return status === "emailed"
      ? "Escalated. It's outside office hours so the conversation was emailed to the team; a system message already told the student. Just add a short friendly line."
      : "Escalated. The student is now in the queue and a system message already told them. Just add a short friendly line; don't repeat the wait time.";
  }

  if (caller.kind !== "student") return "Error: this tool needs the person to be logged in.";
  const supabase = await createClient();

  switch (name) {
    case "get_my_account": {
      const { data: s } = await supabase
        .from("students")
        .select("name, tier, subscription_status, session_duration_minutes, billing_anniversary_date, billing_interval, paused_start, paused_end, coaches:assigned_coach_id(name)")
        .eq("id", caller.studentId)
        .maybeSingle();
      if (!s) return "Error: account not found.";
      const coach = Array.isArray(s.coaches) ? s.coaches[0] : s.coaches;
      return JSON.stringify({
        name: s.name,
        tier: s.tier,
        portal_access: s.tier !== "lite",
        subscription_status: s.subscription_status,
        lesson_length_minutes: s.session_duration_minutes,
        coach: (coach as { name?: string } | null)?.name ?? null,
        billing_interval: s.billing_interval,
        paid_through: fmt(paidThroughEnd(s.billing_anniversary_date, s.billing_interval).toISOString(), ctx.timeZone),
        paused: s.paused_start ? { from: s.paused_start, to: s.paused_end } : null,
      });
    }

    case "get_my_upcoming_lessons": {
      const { ok, json } = await callRoute(upcomingGET, ctx.origin, "/api/sessions/upcoming");
      if (!ok) return `Error: ${json.error ?? "couldn't load lessons"}`;
      const sessions = (json.sessions as { id: string; scheduled_at: string; duration_minutes: number; is_makeup: boolean }[]) ?? [];
      const now = Date.now();
      return JSON.stringify({
        lessons: sessions.map((s) => ({
          session_id: s.id,
          when: fmt(s.scheduled_at, ctx.timeZone),
          minutes: s.duration_minutes,
          is_makeup: s.is_makeup,
          hours_until: Math.round((new Date(s.scheduled_at).getTime() - now) / 36e5),
        })),
        group_lessons: ((json.groupLessons as { topic?: string | null; scheduledAt: string }[]) ?? []).map((g) => ({
          topic: g.topic,
          when: fmt(g.scheduledAt, ctx.timeZone),
        })),
        paid_through: json.paidThrough ? fmt(String(json.paidThrough), ctx.timeZone) : null,
      });
    }

    case "get_my_credits": {
      const { data } = await supabase
        .from("makeup_credits")
        .select("id, type, expires_at, duration_minutes, created_at")
        .eq("student_id", caller.studentId)
        .eq("used", false)
        .is("used_session_id", null)
        .order("created_at");
      const live = (data ?? []).filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > Date.now());
      return JSON.stringify({
        credits: live.map((c) => ({
          credit_id: c.id,
          type: c.type,
          minutes: c.duration_minutes ?? null,
          expires: c.expires_at ? fmt(c.expires_at, ctx.timeZone) : "never",
        })),
      });
    }

    case "get_open_slots": {
      const days = Math.min(30, Math.max(1, Number(input.days) || 14));
      const from = input.from_date ? new Date(`${String(input.from_date)}T00:00:00Z`) : new Date();
      const start = isNaN(from.getTime()) || from.getTime() < Date.now() ? new Date() : from;
      const end = new Date(start.getTime() + days * 864e5);
      const qs = new URLSearchParams({
        studentId: caller.studentId,
        creditId: String(input.credit_id ?? ""),
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const { ok, json } = await callRoute(slotsGET, ctx.origin, `/api/booking/slots?${qs}`);
      if (!ok) return `Error: ${json.error ?? "couldn't load open times"}`;
      const slots = ((json.slots as { start: string }[]) ?? []).slice(0, 40);
      return JSON.stringify({
        slots: slots.map((s) => ({ slot_start: s.start, when: fmt(s.start, ctx.timeZone) })),
        note: slots.length === 0 ? "No open times in that range — try later dates, or suggest the Scheduler page." : undefined,
      });
    }

    case "get_my_notification_settings": {
      const { data } = await supabase.from("students").select(NOTIFY_KEYS.join(", ")).eq("id", caller.studentId).maybeSingle();
      return JSON.stringify(data ?? {});
    }

    case "propose_cancel_lesson": {
      const { data: s } = await supabase
        .from("sessions")
        .select("id, student_id, scheduled_at, status")
        .eq("id", String(input.session_id ?? ""))
        .maybeSingle();
      if (!s || s.student_id !== caller.studentId || s.status !== "scheduled") return "Error: that lesson isn't one of their scheduled lessons.";
      const hours = (new Date(s.scheduled_at).getTime() - Date.now()) / 36e5;
      const credit = hours >= 24 ? "earns a make-up credit (if under the monthly/yearly cap)" : "is under 24h notice — NO make-up credit";
      return proposeAction(
        ctx,
        {
          kind: "cancel_lesson",
          params: { sessionId: s.id, reason: input.reason ? String(input.reason) : null },
          label: `Cancel lesson on ${fmt(s.scheduled_at, ctx.timeZone)}`,
        },
        `Cancel your lesson on ${fmt(s.scheduled_at, ctx.timeZone)}? This ${credit}.`,
      );
    }

    case "propose_book_lesson": {
      const slot = String(input.slot_start ?? "");
      if (isNaN(new Date(slot).getTime())) return "Error: slot_start must be an ISO time from get_open_slots.";
      return proposeAction(
        ctx,
        {
          kind: "book_lesson",
          params: { studentId: caller.studentId, slotStart: slot, makeupCreditId: String(input.credit_id ?? "") },
          label: `Book make-up lesson on ${fmt(slot, ctx.timeZone)}`,
        },
        `Book a make-up lesson on ${fmt(slot, ctx.timeZone)} using one of your credits?`,
      );
    }

    case "propose_notification_change": {
      const changes = Object.fromEntries(
        NOTIFY_KEYS.filter((k) => typeof input[k] === "boolean").map((k) => [k, input[k] as boolean]),
      );
      if (Object.keys(changes).length === 0) return "Error: no settings to change.";
      const pretty = Object.entries(changes)
        .map(([k, v]) => {
          const [, topic, channel] = k.split("_");
          return `${TOPIC_NAMES[topic] ?? topic} by ${channel === "sms" ? "text" : "email"}: ${v ? "ON" : "OFF"}`;
        })
        .join("; ");
      return proposeAction(
        ctx,
        { kind: "notification_change", params: changes, label: `Notification settings — ${pretty}` },
        `Update your notification settings? ${pretty}.`,
      );
    }
  }

  return `Error: unknown tool ${name}.`;
}
