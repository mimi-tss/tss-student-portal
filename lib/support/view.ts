import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GUEST_COOKIE,
  isClosed,
  etaMinutesLeft,
  loadMessages,
  MIN_BOT_REPLIES_BEFORE_HUMAN,
  queuePosition,
  signAttachmentUrls,
  type SupportCaller,
  type SupportMessage,
  type SupportThread,
} from "@/lib/support/thread";
import { splitSuggestions } from "@/lib/support/suggestions";
import { describeOfficeHours, isWithinOfficeHours, loadSupportSettings } from "@/lib/support/settings";

export interface HelpView {
  caller: { kind: "student" | "coach" | "guest"; name: string | null; email: string | null };
  thread: {
    id: string;
    status: SupportThread["status"];
    closed: boolean;
    queuePosition: number | null;
    canAskForHuman: boolean;
    // Admin-promised wait (minutes left), null = use expectedWaitMinutes.
    etaMinutes: number | null;
  } | null;
  inOfficeHours: boolean;
  officeHours: string;
  expectedWaitMinutes: number;
  supportEmail: string;
  messages: {
    id: string;
    sender: string;
    body: string | null;
    attachmentUrl: string | null;
    attachmentName: string | null;
    action: { kind: string; label: string; status: string; result?: string } | null;
    createdAt: string;
  }[];
  // Tap-to-reply buttons from Mel's latest reply — only while the bot
  // still owns the chat and that reply is the last thing said.
  suggestions: string[];
}

// What /help renders — shared by every student-facing support route so
// each one can just return the fresh state after acting.
export async function buildHelpView(
  admin: SupabaseClient,
  caller: SupportCaller,
  thread: SupportThread | null,
): Promise<HelpView> {
  const settings = await loadSupportSettings(admin);
  const messages = thread ? await loadMessages(admin, thread.id) : [];
  const signed = await signAttachmentUrls(
    admin,
    messages.map((m) => m.attachment_path).filter((p): p is string => !!p),
  );

  return {
    caller: {
      kind: caller.kind,
      name: caller.kind === "guest" ? (thread?.guest_name ?? null) : caller.name,
      email: caller.kind === "guest" ? null : caller.email,
    },
    thread: thread
      ? {
          id: thread.id,
          status: thread.status,
          closed: isClosed(thread),
          queuePosition: await queuePosition(admin, thread),
          canAskForHuman: thread.status === "bot" && thread.bot_turns >= MIN_BOT_REPLIES_BEFORE_HUMAN,
          etaMinutes: etaMinutesLeft(thread),
        }
      : null,
    inOfficeHours: isWithinOfficeHours(settings),
    officeHours: describeOfficeHours(settings),
    expectedWaitMinutes: settings.expectedWaitMinutes,
    supportEmail: settings.supportEmail,
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: splitSuggestions(m.body).text,
      attachmentUrl: m.attachment_path ? (signed[m.attachment_path] ?? null) : null,
      attachmentName: m.attachment_path ? (m.attachment_path.split("/").pop() ?? null) : null,
      action: m.action
        ? { kind: m.action.kind, label: m.action.label, status: m.action.status, result: m.action.result }
        : null,
      createdAt: m.created_at,
    })),
    suggestions: latestSuggestions(thread, messages),
  };
}

function latestSuggestions(thread: SupportThread | null, messages: SupportMessage[]): string[] {
  const last = messages[messages.length - 1];
  if (!thread || thread.status !== "bot" || !last || last.sender !== "bot" || last.action) return [];
  return splitSuggestions(last.body).suggestions;
}

export function helpResponse(view: HelpView, newGuestToken: string | null, status = 200) {
  const res = NextResponse.json({ ...view, guestToken: newGuestToken ?? undefined }, { status });
  if (newGuestToken) {
    res.cookies.set(GUEST_COOKIE, newGuestToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  }
  return res;
}
