import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAttentionItem, type AttentionStatus } from "@/lib/admin/attention-items";

const STATUSES: AttentionStatus[] = ["needs_action", "in_progress", "resolved"];

// Admin moves an attention item between needs_action / in_progress /
// resolved, optionally attaching a note — the manual-work tracking the
// Needs Review page's tabs are built around.
export async function POST(req: NextRequest) {
  const { itemId, status, note, requestOutcome } = await req.json();

  if (!itemId || !STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (requestOutcome && !["approved", "denied"].includes(requestOutcome)) {
    return NextResponse.json({ error: "requestOutcome must be approved or denied" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await resolveAttentionItem(supabase, itemId, { status, note, resolvedBy: user.id, requestOutcome });

  return NextResponse.json({ success: true });
}
