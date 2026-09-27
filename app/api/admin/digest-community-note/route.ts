import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminProfileId } from "@/lib/support/admin";
import { nextDigestWeekKey } from "@/lib/digest/community";

// Save the "This week in Backstage" blurb for the next Monday digest
// (lib/digest/community.ts). Blank body deletes it, so that week falls
// back to the standing invite line.
export async function POST(req: NextRequest) {
  const profileId = await requireAdminProfileId();
  if (!profileId) return NextResponse.json({ error: "admins only" }, { status: 403 });

  const { body } = (await req.json()) as { body?: string };
  const text = (body ?? "").trim();
  if (text.length > 600) return NextResponse.json({ error: "Keep it under 600 characters" }, { status: 400 });

  const admin = createAdminClient();
  const weekStart = nextDigestWeekKey();
  const { error } = text
    ? await admin
        .from("digest_community_notes")
        .upsert({ week_start: weekStart, body: text, updated_at: new Date().toISOString(), updated_by: profileId })
    : await admin.from("digest_community_notes").delete().eq("week_start", weekStart);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, weekStart });
}
