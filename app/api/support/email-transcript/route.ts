import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addMessage, findLatestThread, resolveSupportCaller } from "@/lib/support/thread";
import { emailTranscript } from "@/lib/support/escalate";
import { loadSupportSettings } from "@/lib/support/settings";
import { buildHelpView, helpResponse } from "@/lib/support/view";

export const dynamic = "force-dynamic";

// "Can't wait? Email us instead" — only offered while waiting in the
// queue. Sends the whole chat (+ screenshots) to the studio inbox and
// closes the live chat.
export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  const caller = await resolveSupportCaller(req);
  const thread = await findLatestThread(admin, caller);
  if (!thread || thread.status !== "needs_human") {
    return NextResponse.json({ error: "There's nothing waiting to send." }, { status: 409 });
  }

  const settings = await loadSupportSettings(admin);
  try {
    await emailTranscript(admin, thread, "student_chose_email");
  } catch (err) {
    console.error("support transcript email failed", err);
    return NextResponse.json({ error: "Couldn't send the email. Please stay in the chat or try again." }, { status: 502 });
  }

  const replyTo = caller.kind === "guest" ? thread.guest_email : caller.email;
  await addMessage(admin, {
    threadId: thread.id,
    sender: "system",
    body: `Done — this conversation (and any screenshots) was sent to ${settings.supportEmail}. The team will reply${replyTo ? ` to ${replyTo}` : ""} by email.`,
  });

  const { data: fresh } = await admin.from("support_threads").select("*").eq("id", thread.id).single();
  return helpResponse(await buildHelpView(admin, caller, fresh ?? thread), null);
}
