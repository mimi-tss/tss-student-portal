import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// Edits coaches.slack_webhook_url — the per-coach Incoming Webhook URL
// their own Slack channel notifications post to. Same shape as
// coach-links/route.ts (meet_link): both roles (isAdminRole), hardened
// zero-rows check via the "admins can update coaches" RLS policy.
export async function POST(req: NextRequest) {
  const { coachId, slackWebhookUrl } = await req.json();

  if (!coachId || slackWebhookUrl === undefined) {
    return NextResponse.json({ error: "coachId and slackWebhookUrl are required" }, { status: 400 });
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

  const { data: updated, error } = await supabase
    .from("coaches")
    .update({ slack_webhook_url: slackWebhookUrl ? String(slackWebhookUrl).trim() || null : null })
    .eq("id", coachId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "coach not found or not updated" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
