import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findLatestThread, resolveSupportCaller } from "@/lib/support/thread";

export const dynamic = "force-dynamic";

// 1-5 stars for a finished chat with Mel (shown to admin in the inbox).
// Only the caller's own latest chat, only once it's resolved, only once.
export async function POST(req: NextRequest) {
  const { stars } = (await req.json().catch(() => ({}))) as { stars?: number };
  const n = Math.round(Number(stars));
  if (!Number.isFinite(n) || n < 1 || n > 5) return NextResponse.json({ error: "Pick 1 to 5 stars." }, { status: 400 });

  const admin = createAdminClient();
  const caller = await resolveSupportCaller(req);
  const thread = await findLatestThread(admin, caller);
  if (!thread || thread.status !== "resolved") return NextResponse.json({ error: "Nothing to rate." }, { status: 409 });
  if (thread.rating) return NextResponse.json({ ok: true });

  await admin.from("support_threads").update({ rating: n, rated_at: new Date().toISOString() }).eq("id", thread.id);
  return NextResponse.json({ ok: true });
}
