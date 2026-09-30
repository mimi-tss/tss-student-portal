import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoCloseStale, findLatestThread, resolveSupportCaller, threadToShow } from "@/lib/support/thread";
import { buildHelpView, helpResponse } from "@/lib/support/view";

export const dynamic = "force-dynamic";

// Polled by /help (every few seconds) for new bot/admin replies and the
// caller's place in the queue. Never creates anything — but closes the
// caller's chat if Mel has been waiting on them for 5 minutes.
export async function GET(req: NextRequest) {
  const admin = createAdminClient();
  const caller = await resolveSupportCaller(req);
  let thread = await findLatestThread(admin, caller);
  if (thread?.status === "bot") {
    await autoCloseStale(admin, thread.id);
    thread = await findLatestThread(admin, caller);
  }
  return helpResponse(await buildHelpView(admin, caller, threadToShow(thread)), null);
}
