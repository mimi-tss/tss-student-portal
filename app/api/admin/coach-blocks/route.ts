import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifySlack } from "@/lib/slack/notify";

// Admin adding a time-off block on a coach's behalf — same table/effect
// as a coach's own app/api/coach/blocks, just coach-selectable. RLS
// ("admins can manage all blocks", migration 0033) enforces the
// admin-only check.
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
