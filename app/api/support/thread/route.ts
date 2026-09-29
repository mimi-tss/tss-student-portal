import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findLatestThread, resolveSupportCaller } from "@/lib/support/thread";
import { buildHelpView, helpResponse } from "@/lib/support/view";

export const dynamic = "force-dynamic";

// Polled by /help (every few seconds) for new bot/admin replies and the
// caller's place in the queue. Never creates anything.
export async function GET(req: NextRequest) {
  const admin = createAdminClient();
  const caller = await resolveSupportCaller(req);
  const thread = await findLatestThread(admin, caller);
  return helpResponse(await buildHelpView(admin, caller, thread), null);
}
