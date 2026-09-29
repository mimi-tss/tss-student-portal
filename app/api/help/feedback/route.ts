import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// "Was this helpful?" on a public help article. Anonymous; the browser
// remembers its own vote (app/help/article-feedback.tsx), so this just
// bumps the counter. Only published articles count.
export async function POST(req: NextRequest) {
  const { slug, helpful } = (await req.json().catch(() => ({}))) as { slug?: string; helpful?: boolean };
  if (!slug || typeof helpful !== "boolean") return NextResponse.json({ error: "bad request" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("support_kb_articles")
    .select("id, helpful_yes, helpful_no")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  const update = helpful ? { helpful_yes: data.helpful_yes + 1 } : { helpful_no: data.helpful_no + 1 };
  await admin.from("support_kb_articles").update(update).eq("id", data.id);
  return NextResponse.json({ ok: true });
}
