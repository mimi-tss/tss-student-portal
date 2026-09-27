import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminProfileId } from "@/lib/auth/require-admin-api";

// "What's Coming Up" list for the Monday digest. Not per week — past
// dates simply stop showing (lib/digest/content.ts).
export async function POST(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "admins only" }, { status: 403 });
  const { eventDate, title } = (await req.json()) as { eventDate?: string; title?: string };
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !title?.trim()) {
    return NextResponse.json({ error: "Add a date and a title" }, { status: 400 });
  }
  const { data, error } = await createAdminClient()
    .from("digest_events")
    .insert({ event_date: eventDate, title: title.trim().slice(0, 120) })
    .select("id, event_date, title")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: { id: data.id, eventDate: data.event_date, title: data.title } });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "admins only" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await createAdminClient().from("digest_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
