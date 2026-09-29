import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminProfileId } from "@/lib/support/admin";

export const dynamic = "force-dynamic";

const CATEGORIES = ["portal", "scheduling", "kajabi-courses", "kajabi-community", "billing", "login", "other"];

// Help articles the bot answers from (support_kb_articles) + the
// single-row support settings. Edits take effect on the bot's very next
// reply — it reads both fresh each time.
export async function POST(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (payload.op === "delete") {
    const { error } = await admin.from("support_kb_articles").delete().eq("id", String(payload.id ?? ""));
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }

  if (payload.op === "settings") {
    const minutes = Number(payload.expected_wait_minutes);
    const update = {
      office_hours: payload.office_hours,
      expected_wait_minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 8,
      support_email: String(payload.support_email ?? "").trim() || "info@tarasimonstudios.com",
      timezone: String(payload.timezone ?? "").trim() || "America/New_York",
      updated_at: now,
    };
    const { error } = await admin.from("support_settings").update(update).eq("id", 1);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }

  const title = String(payload.title ?? "").trim();
  const body = String(payload.body ?? "").trim();
  const category = String(payload.category ?? "");
  if (!title || !body || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Title, text and a category are required." }, { status: 400 });
  }
  const row = {
    title,
    body,
    category,
    active: payload.active !== false,
    sort_order: Number(payload.sort_order) || 0,
    updated_at: now,
  };

  const result = payload.id
    ? await admin.from("support_kb_articles").update(row).eq("id", String(payload.id)).select("*").single()
    : await admin.from("support_kb_articles").insert(row).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ article: result.data });
}
