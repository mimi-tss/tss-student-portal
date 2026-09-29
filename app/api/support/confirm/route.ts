import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findLatestThread, resolveSupportCaller, type SupportMessage } from "@/lib/support/thread";
import { buildHelpView, helpResponse } from "@/lib/support/view";
import { POST as cancelPOST } from "@/app/api/booking/cancel/route";
import { POST as bookPOST } from "@/app/api/booking/book/route";
import { POST as notificationsPOST } from "@/app/api/notifications/preferences/route";

export const dynamic = "force-dynamic";

type Handler = (req: NextRequest) => Promise<Response>;

// Runs (or declines) an action the bot proposed, on the student's own
// click. Calls the SAME route handlers the portal's own buttons use, in
// this request's context — so the student's session, ownership checks,
// 24h credit rule, caps and booking validation all apply exactly as if
// they'd clicked it on the Scheduler/Account page. The bot never writes.
const HANDLERS: Record<string, { handler: Handler; path: string }> = {
  cancel_lesson: { handler: cancelPOST, path: "/api/booking/cancel" },
  book_lesson: { handler: bookPOST, path: "/api/booking/book" },
  notification_change: { handler: notificationsPOST, path: "/api/notifications/preferences" },
};

export async function POST(req: NextRequest) {
  const { messageId, decision } = (await req.json().catch(() => ({}))) as {
    messageId?: string;
    decision?: "confirm" | "decline";
  };

  const admin = createAdminClient();
  const caller = await resolveSupportCaller(req);
  if (caller.kind !== "student") return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const thread = await findLatestThread(admin, caller);
  const { data: msg } = await admin.from("support_messages").select("*").eq("id", messageId ?? "").maybeSingle();
  const message = msg as SupportMessage | null;
  if (!thread || !message || message.thread_id !== thread.id || !message.action) {
    return NextResponse.json({ error: "That action wasn't found." }, { status: 404 });
  }
  if (message.action.status !== "pending") {
    return NextResponse.json({ error: "That was already handled." }, { status: 409 });
  }

  // Claim it first so a double-tap can't run it twice.
  const { data: claimed } = await admin
    .from("support_messages")
    .update({ action: { ...message.action, status: "failed", result: "running" } })
    .eq("id", message.id)
    .eq("action->>status", "pending")
    .select("id");
  if (!claimed?.length) return NextResponse.json({ error: "That was already handled." }, { status: 409 });

  let status: "done" | "declined" | "failed" = "declined";
  let result = "Not now";

  if (decision === "confirm") {
    const target = HANDLERS[message.action.kind];
    if (!target) {
      status = "failed";
      result = "Unknown action";
    } else {
      const res = await target.handler(
        new NextRequest(new URL(target.path, req.nextUrl.origin), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.action.params),
        }),
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      status = res.ok ? "done" : "failed";
      result = res.ok ? (json.message ?? "Done") : (json.error ?? "Something went wrong");
    }
  }

  await admin.from("support_messages").update({ action: { ...message.action, status, result } }).eq("id", message.id);

  await admin.from("support_messages").insert({
    thread_id: thread.id,
    sender: "system",
    body:
      status === "done"
        ? `✓ ${message.action.label} — done. ${result === "Done" ? "" : result}`.trim()
        : status === "declined"
          ? `No problem — nothing was changed.`
          : `That didn't go through: ${result}. You can try again, or tap “Talk to a person”.`,
  });

  const { data: fresh } = await admin.from("support_threads").select("*").eq("id", thread.id).single();
  return helpResponse(await buildHelpView(admin, caller, fresh ?? thread), null);
}
