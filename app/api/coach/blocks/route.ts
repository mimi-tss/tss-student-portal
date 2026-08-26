import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySlack } from "@/lib/slack/notify";
import { createAttentionItem } from "@/lib/admin/attention-items";

// Coach's own personal time-off block (spec section 5: "coach availability
// ... minus personal blocks"). RLS ("coaches can manage their own blocks",
// migration 0033) scopes the insert to the caller's own coach_id. Admin
// gets a Slack ping + a dashboard listing (app/(admin)/admin/dashboard) so
// a block isn't silently added against already-booked sessions.
export async function POST(req: NextRequest) {
  const { startAt, endAt, reason } = await req.json();

  if (!startAt || !endAt) {
    return NextResponse.json({ error: "startAt and endAt required" }, { status: 400 });
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, name")
    .eq("profile_id", user.id)
    .single();
  if (!coach) return NextResponse.json({ error: "no coach record" }, { status: 404 });

  const { error } = await supabase.from("coach_blocks").insert({
    coach_id: coach.id,
    start_at: startAt,
    end_at: endAt,
    reason: reason || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await notifySlack(
    `🗓️ *${coach.name}* added a time-off block: ${new Date(startAt).toLocaleString()} – ${new Date(endAt).toLocaleString()}${reason ? ` — ${reason}` : ""}`,
  );

  await createAttentionItem(createAdminClient(), {
    kind: "coach_block_added",
    coachId: coach.id,
    summary: `${coach.name} blocked ${new Date(startAt).toLocaleString()} – ${new Date(endAt).toLocaleString()}${reason ? ` — ${reason}` : ""}`,
  });

  return NextResponse.json({ success: true });
}
