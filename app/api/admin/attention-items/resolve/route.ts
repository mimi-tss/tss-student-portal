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

  // Billing-request kinds (cancel/pause/change-plan) can now throw here
  // — a real Stripe call that failed — and that must surface as a real
  // error, not a silent "success" the admin UI would otherwise show.
  try {
    await resolveAttentionItem(supabase, itemId, { status, note, resolvedBy: user.id, requestOutcome });
  } catch (err) {
    console.error("resolveAttentionItem failed", err);
    const message = err instanceof Error ? err.message : "Something went wrong applying that action in Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
