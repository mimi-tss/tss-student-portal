import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifySlack } from "@/lib/slack/notify";

// Admin adding a time-off block on a coach's behalf — same table/effect
// as a coach's own app/api/coach/blocks, just coach-selectable. RLS
// ("admins can manage all blocks", migration 0033) enforces the
// admin-only check.

// One-off blocks for a coach's "Time off" panel — deliberately excludes
// anything tied to a recurring_coach_block_id (Team Huddle, a standing
// lunch break materialized by lib/coach-blocks.ts): those are managed
// from the Recurring time off list's own Stop button, not here, so they
// don't clutter this one-off list or get individually deletable in a
// way that'd silently diverge from their rule. Includes anything not
// fully in the past (end_at >= now) so an admin can still see/fix a
// currently-in-progress block, not just upcoming ones.
export async function GET(req: NextRequest) {
  const coachId = req.nextUrl.searchParams.get("coachId");
  if (!coachId) return NextResponse.json({ error: "coachId required" }, { status: 400 });

  const supabase = await createClient();

  const { data } = await supabase
    .from("coach_blocks")
    .select("id, start_at, end_at, reason")
    .eq("coach_id", coachId)
    .is("recurring_coach_block_id", null)
    .gte("end_at", new Date().toISOString())
    .order("start_at");

  return NextResponse.json({ blocks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { coachId, startAt, endAt, reason } = await req.json();

  if (!coachId || !startAt || !endAt) {
    return NextResponse.json({ error: "coachId, startAt and endAt required" }, { status: 400 });
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: coach } = await supabase.from("coaches").select("name").eq("id", coachId).single();
  if (!coach) return NextResponse.json({ error: "coach not found" }, { status: 404 });

  const { error } = await supabase.from("coach_blocks").insert({
    coach_id: coachId,
    start_at: startAt,
    end_at: endAt,
    reason: reason || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await notifySlack(
    `🗓️ Admin added a time-off block for *${coach.name}*: ${new Date(startAt).toLocaleString()} – ${new Date(endAt).toLocaleString()}${reason ? ` — ${reason}` : ""}`,
  );

  return NextResponse.json({ success: true });
}

// Removes a one-off block outright (unlike the recurring rule's Stop,
// which soft-deactivates the rule — a one-off block has no rule behind
// it to keep, so there's nothing to preserve by soft-deleting instead).
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("coach_blocks").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
