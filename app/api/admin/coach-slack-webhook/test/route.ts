import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { notifyCoach } from "@/lib/notifications/create";

// Sends a real test message through the exact same code path a real
// booked/cancelled/chat event uses (notifyCoach → lib/slack/notify.ts) —
// reads the coach's CURRENTLY SAVED slack_webhook_url fresh from the DB,
// not whatever's typed in the edit form, so this genuinely proves the
// app's own read-from-DB-and-send pipeline works, not just that the raw
// webhook URL is valid (that part's on Slack's side, not ours). Always
// sends — dedupKey includes the timestamp so notification_log's dedup can
// never block a deliberate re-test.
export async function POST(req: NextRequest) {
  const { coachId } = await req.json();

  if (!coachId) {
    return NextResponse.json({ error: "coachId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: coach } = await admin
    .from("coaches")
    .select("name, slack_webhook_url")
    .eq("id", coachId)
    .maybeSingle();

  if (!coach) {
    return NextResponse.json({ error: "coach not found" }, { status: 404 });
  }
  if (!coach.slack_webhook_url) {
    return NextResponse.json(
      { error: "This coach has no Slack webhook URL saved yet — save one first, then test." },
      { status: 400 },
    );
  }

  await notifyCoach(admin, {
    coachId,
    coachSlackWebhookUrl: coach.slack_webhook_url,
    kind: "admin_test",
    dedupKey: `admin_test:${coachId}:${Date.now()}`,
    text: `🔔 Test notification for ${coach.name} — if you can see this in the right channel, the webhook saved for this coach is wired up correctly.`,
  });

  return NextResponse.json({ ok: true });
}
