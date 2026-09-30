import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export function isMinorBirthDate(birthDate: string | null | undefined, now = new Date()): boolean {
  if (!birthDate) return false;
  const b = new Date(`${birthDate}T00:00:00Z`);
  if (isNaN(b.getTime())) return false;
  const eighteenth = new Date(Date.UTC(b.getUTCFullYear() + 18, b.getUTCMonth(), b.getUTCDate()));
  return now < eighteenth;
}

export const GUEST_COOKIE = "tss_support_guest";
export const GUEST_HEADER = "x-support-guest";
// The "Talk to someone" button only appears (and the escalate route only
// accepts it) after the bot has had this many tries — the point of the
// bot is to cut admin time, so it gets a real shot first. The bot itself
// can still hand off earlier for staff-only issues (refunds, access...).
export const MIN_BOT_REPLIES_BEFORE_HUMAN = 3;

export type SupportCaller =
  | {
      kind: "student";
      profileId: string;
      studentId: string;
      name: string;
      email: string;
      tier: string;
      // Under 18 by birth_date (null birth_date = unknown, treated as adult).
      isMinor: boolean;
    }
  | { kind: "coach"; profileId: string; coachId: string; name: string; email: string }
  | { kind: "guest"; guestToken: string | null };

export interface SupportThread {
  id: string;
  student_id: string | null;
  coach_id: string | null;
  profile_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_token: string | null;
  status: "bot" | "needs_human" | "claimed" | "emailed" | "resolved";
  escalation_reason: string | null;
  escalation_summary: string | null;
  escalated_at: string | null;
  claimed_by: string | null;
  eta_minutes: number | null;
  eta_set_at: string | null;
  bot_turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  thread_id: string;
  sender: "student" | "coach" | "guest" | "bot" | "admin" | "system";
  sender_profile_id: string | null;
  body: string | null;
  attachment_path: string | null;
  action: SupportAction | null;
  created_at: string;
}

export interface SupportAction {
  kind: "cancel_lesson" | "book_lesson" | "notification_change" | "contact_request";
  params: Record<string, unknown>;
  label: string;
  status: "pending" | "done" | "declined" | "failed";
  result?: string;
}

// Who is on /help. A logged-in student (any tier — Lite has no portal
// access but still gets help here) is identified by their session; staff
// or anyone without a student row are treated as guests. A guest's
// thread is found by a random token held in a cookie, with a header
// fallback since Safari drops cookies inside the Kajabi iframe.
export async function resolveSupportCaller(req: NextRequest): Promise<SupportCaller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: student } = await supabase
      .from("students")
      .select("id, name, email, tier, birth_date")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (student) {
      return {
        kind: "student",
        profileId: user.id,
        studentId: student.id,
        name: student.name,
        email: student.email,
        tier: student.tier,
        isMinor: isMinorBirthDate(student.birth_date),
      };
    }
    // Coaches get Mel too — coach articles only, no student tools.
    const { data: coach } = await supabase
      .from("coaches")
      .select("id, name, email")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (coach) {
      return { kind: "coach", profileId: user.id, coachId: coach.id, name: coach.name, email: coach.email };
    }
  }

  const token = req.headers.get(GUEST_HEADER) || req.cookies.get(GUEST_COOKIE)?.value || null;
  return { kind: "guest", guestToken: token && /^[a-f0-9]{48}$/.test(token) ? token : null };
}

// The caller's most recent thread from the last week (any status), so a
// student who comes back still sees where things stand — including a
// chat that was emailed to the team or resolved.
export async function findLatestThread(admin: SupabaseClient, caller: SupportCaller): Promise<SupportThread | null> {
  let query = admin
    .from("support_threads")
    .select("*")
    .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
  if (caller.kind === "student") query = query.eq("student_id", caller.studentId);
  else if (caller.kind === "coach") query = query.eq("coach_id", caller.coachId);
  else if (caller.guestToken) query = query.eq("guest_token", caller.guestToken);
  else return null;

  const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as SupportThread | null) ?? null;
}

export function isClosed(thread: SupportThread) {
  return thread.status === "emailed" || thread.status === "resolved";
}

// A new message goes into the latest thread unless that one is closed
// (emailed/resolved) — then it starts a fresh conversation.
export async function getOrCreateThread(
  admin: SupabaseClient,
  caller: SupportCaller,
): Promise<{ thread: SupportThread; newGuestToken: string | null }> {
  const existing = await findLatestThread(admin, caller);
  if (existing && !isClosed(existing)) return { thread: existing, newGuestToken: null };

  const guestToken = caller.kind === "guest" ? (caller.guestToken ?? randomBytes(24).toString("hex")) : null;
  const carry =
    caller.kind === "guest" && existing ? { guest_name: existing.guest_name, guest_email: existing.guest_email } : {};
  const { data, error } = await admin
    .from("support_threads")
    .insert(
      caller.kind === "student"
        ? { student_id: caller.studentId, profile_id: caller.profileId }
        : caller.kind === "coach"
          ? { coach_id: caller.coachId, profile_id: caller.profileId }
          : { guest_token: guestToken, ...carry },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(`couldn't create support thread: ${error?.message}`);

  return {
    thread: data as SupportThread,
    newGuestToken: caller.kind === "guest" && guestToken !== caller.guestToken ? guestToken : null,
  };
}

// Minutes left on the wait an admin promised (min 1 while still waiting),
// or null if nobody has acknowledged the ping yet.
export function etaMinutesLeft(thread: Pick<SupportThread, "eta_minutes" | "eta_set_at">, now = Date.now()): number | null {
  if (!thread.eta_minutes || !thread.eta_set_at) return null;
  const left = thread.eta_minutes - (now - new Date(thread.eta_set_at).getTime()) / 60000;
  return Math.max(1, Math.ceil(left));
}

// 1-based place in the human queue: older unclaimed escalations + 1.
export async function queuePosition(admin: SupabaseClient, thread: SupportThread): Promise<number | null> {
  if (thread.status !== "needs_human" || !thread.escalated_at) return null;
  const { count } = await admin
    .from("support_threads")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_human")
    .lt("escalated_at", thread.escalated_at);
  return (count ?? 0) + 1;
}

export async function loadMessages(admin: SupabaseClient, threadId: string): Promise<SupportMessage[]> {
  const { data } = await admin
    .from("support_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  return (data as SupportMessage[] | null) ?? [];
}

export async function signAttachmentUrls(
  admin: SupabaseClient,
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await admin.storage.from("support-attachments").createSignedUrls(paths, expiresIn);
  const out: Record<string, string> = {};
  for (const u of data ?? []) if (u.path && u.signedUrl) out[u.path] = u.signedUrl;
  return out;
}

export async function addMessage(
  admin: SupabaseClient,
  msg: {
    threadId: string;
    sender: SupportMessage["sender"];
    body?: string | null;
    senderProfileId?: string | null;
    attachmentPath?: string | null;
    action?: SupportAction | null;
  },
): Promise<SupportMessage> {
  const { data, error } = await admin
    .from("support_messages")
    .insert({
      thread_id: msg.threadId,
      sender: msg.sender,
      body: msg.body ?? null,
      sender_profile_id: msg.senderProfileId ?? null,
      attachment_path: msg.attachmentPath ?? null,
      action: msg.action ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`couldn't save support message: ${error?.message}`);
  await admin.from("support_threads").update({ updated_at: new Date().toISOString() }).eq("id", msg.threadId);
  return data as SupportMessage;
}

// Which `sender` a caller's own messages are stored as.
export function callerSender(caller: SupportCaller): "student" | "coach" | "guest" {
  return caller.kind;
}

export function callerProfileId(caller: SupportCaller): string | null {
  return caller.kind === "guest" ? null : caller.profileId;
}

export function displayName(thread: Pick<SupportThread, "guest_name" | "guest_email">, studentName?: string | null) {
  return studentName ?? thread.guest_name ?? thread.guest_email ?? "Guest";
}
