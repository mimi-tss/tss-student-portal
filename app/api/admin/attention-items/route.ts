import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAttentionItems, type AttentionStatus } from "@/lib/admin/attention-items";

const STATUSES: AttentionStatus[] = ["needs_action", "in_progress", "resolved"];

// Some headroom past the default — every call reconciles 6 condition-
// driven kinds (including the recording-matching pass, batched but
// still a handful of sequential round-trips) before returning anything.
export const maxDuration = 60;

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
