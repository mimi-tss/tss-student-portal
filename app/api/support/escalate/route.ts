import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addMessage,
  findLatestThread,
  getOrCreateThread,
  isClosed,
  MIN_BOT_REPLIES_BEFORE_HUMAN,
  resolveSupportCaller,
  type SupportMessage,
} from "@/lib/support/thread";
import { escalateThread } from "@/lib/support/escalate";
import { buildHelpView, helpResponse } from "@/lib/support/view";

export const dynamic = "force-dynamic";

// Two ways in:
// 1. The student's own "Talk to someone" link — only offered once the bot
//    has had MIN_BOT_REPLIES_BEFORE_HUMAN tries.
// 2. A guest filling in the name-then-email form Mel showed
//    (ask_guest_contact, `contactRequestId`) — Mel already decided a person
//    is needed, so no minimum, and Mel's own reason/summary go to staff.
// Either way a guest must give an email (the team needs somewhere to reply).
export async function POST(req: NextRequest) {
  const { guestName, guestEmail, contactRequestId } = (await req.json().catch(() => ({}))) as {
    guestName?: string;
    guestEmail?: string;
    contactRequestId?: string;
  };

  const admin = createAdminClient();
  const caller = await resolveSupportCaller(req);

  if (caller.kind === "guest") {
    const existing = await findLatestThread(admin, caller);
    const email = (guestEmail ?? existing?.guest_email ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "needs_contact" }, { status: 400 });
    }
  }

  const { thread, newGuestToken } = await getOrCreateThread(admin, caller);
  if (isClosed(thread)) return NextResponse.json({ error: "This chat is already closed." }, { status: 409 });

  let contactRequest: SupportMessage | null = null;
  if (contactRequestId) {
    const { data } = await admin.from("support_messages").select("*").eq("id", contactRequestId).maybeSingle();
    const msg = data as SupportMessage | null;
    if (msg && msg.thread_id === thread.id && msg.action?.kind === "contact_request" && msg.action.status === "pending") {
      contactRequest = msg;
    }
  }

  if (!contactRequest && thread.status === "bot" && thread.bot_turns < MIN_BOT_REPLIES_BEFORE_HUMAN) {
    return NextResponse.json({ error: "Tell the assistant what's going on first — it can usually fix it right away." }, { status: 409 });
  }

  if (caller.kind === "guest" && guestEmail) {
    const update = { guest_name: guestName?.trim() || null, guest_email: guestEmail.trim() };
    await admin.from("support_threads").update(update).eq("id", thread.id);
    Object.assign(thread, update);
  }

  await addMessage(admin, {
    threadId: thread.id,
    sender: caller.kind === "student" ? "student" : "guest",
    senderProfileId: caller.kind === "student" ? caller.profileId : null,
    body: contactRequest
      ? `My name is ${thread.guest_name ?? "(not given)"} and my email is ${thread.guest_email}.`
      : "I'd like to talk to a person.",
  });

  if (contactRequest?.action) {
    await admin
      .from("support_messages")
      .update({ action: { ...contactRequest.action, status: "done", result: "Sent to the team" } })
      .eq("id", contactRequest.id);
    await escalateThread(admin, thread, thread.escalation_reason ?? "Needs help", thread.escalation_summary);
  } else {
    await escalateThread(admin, thread, "Asked for a person", null);
  }

  const { data: fresh } = await admin.from("support_threads").select("*").eq("id", thread.id).single();
  return helpResponse(await buildHelpView(admin, caller, fresh ?? thread), newGuestToken);
}
