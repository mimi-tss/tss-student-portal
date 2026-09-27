import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminProfileId } from "@/lib/auth/require-admin-api";
import { nextDigestWeekKey } from "@/lib/digest/week";

interface FeatureInput {
  position: 1 | 2;
  heading?: string;
  body?: string;
  imageUrl?: string;
  buttonLabel?: string;
  buttonUrl?: string;
}

const t = (v: string | undefined, max: number) => {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

// Saves the 2 feature boxes for the NEXT Monday digest. A box with every
// field empty is deleted rather than stored.
export async function POST(req: NextRequest) {
  const profileId = await requireAdminProfileId();
  if (!profileId) return NextResponse.json({ error: "admins only" }, { status: 403 });

  const { features } = (await req.json()) as { features?: FeatureInput[] };
  const weekStart = nextDigestWeekKey();
  const admin = createAdminClient();

  for (const f of features ?? []) {
    if (f.position !== 1 && f.position !== 2) continue;
    const row = {
      heading: t(f.heading, 120),
      body: t(f.body, 1500),
      image_url: t(f.imageUrl, 500),
      button_label: t(f.buttonLabel, 60),
      button_url: t(f.buttonUrl, 500),
    };
    if (row.button_url && !/^https?:\/\//i.test(row.button_url)) {
      return NextResponse.json({ error: `Box ${f.position}: the button link must start with https://` }, { status: 400 });
    }
    if (!!row.button_label !== !!row.button_url) {
      return NextResponse.json(
        { error: `Box ${f.position}: a button needs both a name and a link (or leave both empty)` },
        { status: 400 },
      );
    }

    const empty = !row.heading && !row.body && !row.image_url && !row.button_label;
    const { error } = empty
      ? await admin.from("digest_features").delete().eq("week_start", weekStart).eq("position", f.position)
      : await admin.from("digest_features").upsert(
          { week_start: weekStart, position: f.position, ...row, updated_at: new Date().toISOString(), updated_by: profileId },
          { onConflict: "week_start,position" },
        );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, weekStart });
}
