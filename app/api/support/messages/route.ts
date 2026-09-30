import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addMessage, callerProfileId, callerSender, getOrCreateThread, resolveSupportCaller } from "@/lib/support/thread";
import { runBotTurn } from "@/lib/support/bot";
import { buildHelpView, helpResponse } from "@/lib/support/view";

export const dynamic = "force-dynamic";
// The bot's tool loop can take a while on a lookup-heavy question.
export const maxDuration = 60;

const MAX_BODY = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGES_PER_MINUTE = 6;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

// A student/guest message on /help. Multipart: body, optional `file`
// (screenshot), tz (browser timezone, for how the bot words times).
// Saves the message, then — only while the bot owns the thread — runs
// the bot and returns the fresh view with its reply. Once a thread is
// with a person (needs_human/claimed) the bot stays quiet and the
// message just waits for the team.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const body = String(form.get("body") ?? "").trim();
  const tzRaw = String(form.get("tz") ?? "");
  const file = form.get("file");
  const upload = file instanceof File && file.size > 0 ? file : null;

  if (!body && !upload) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  if (body.length > MAX_BODY) return NextResponse.json({ error: "That message is too long." }, { status: 400 });
  if (upload && !EXTENSIONS[upload.type]) return NextResponse.json({ error: "Please attach an image or PDF." }, { status: 400 });
  if (upload && upload.size > MAX_FILE_BYTES) return NextResponse.json({ error: "That file is over 5 MB." }, { status: 400 });

  let timeZone = "America/New_York";
  try {
    if (tzRaw) {
      new Intl.DateTimeFormat("en-US", { timeZone: tzRaw });
      timeZone = tzRaw;
    }
  } catch {
    // bad zone from the browser — keep the studio default
  }

  const admin = createAdminClient();
  const caller = await resolveSupportCaller(req);
  const { thread, newGuestToken } = await getOrCreateThread(admin, caller);

  const { count: recent } = await admin
    .from("support_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", thread.id)
    .in("sender", ["student", "guest"])
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((recent ?? 0) >= MAX_MESSAGES_PER_MINUTE) {
    return NextResponse.json({ error: "Slow down a little — try again in a minute." }, { status: 429 });
  }

  let attachmentPath: string | null = null;
  if (upload) {
    attachmentPath = `${thread.id}/${crypto.randomUUID()}.${EXTENSIONS[upload.type]}`;
    const { error } = await admin.storage
      .from("support-attachments")
      .upload(attachmentPath, Buffer.from(await upload.arrayBuffer()), { contentType: upload.type });
    if (error) {
      console.error("support attachment upload failed", error);
      return NextResponse.json({ error: "Couldn't upload that file. Please try again." }, { status: 500 });
    }
  }

  await addMessage(admin, {
    threadId: thread.id,
    sender: callerSender(caller),
    senderProfileId: callerProfileId(caller),
    body: body || null,
    attachmentPath,
  });

  // needs_human/claimed: nothing to run — the admin inbox polls, and
  // addMessage bumped updated_at so the thread sorts to the top there.
  if (thread.status === "bot") {
    await runBotTurn(admin, caller, thread, timeZone, req.nextUrl.origin);
  }

  const { data: fresh } = await admin.from("support_threads").select("*").eq("id", thread.id).single();
  return helpResponse(await buildHelpView(admin, caller, fresh ?? thread), newGuestToken);
}
