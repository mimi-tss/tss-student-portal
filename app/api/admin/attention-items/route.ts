import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAttentionItems, type AttentionStatus } from "@/lib/admin/attention-items";

const STATUSES: AttentionStatus[] = ["needs_action", "in_progress", "resolved"];

// Backs the Needs Review page's three tabs. Also reconciles the 5
// condition-driven kinds (credit_expiring, trial_unbooked, etc.) against
// current data on every call — see syncComputedAttentionItems.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const statusParam = req.nextUrl.searchParams.get("status");
  const status = STATUSES.includes(statusParam as AttentionStatus) ? (statusParam as AttentionStatus) : undefined;

  const items = await getAttentionItems(supabase, status);
  return NextResponse.json({ items });
}
