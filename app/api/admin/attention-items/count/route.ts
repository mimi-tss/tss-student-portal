import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// A plain count, no sync — split out of GET /api/admin/attention-items
// specifically for AdminNav's sidebar badge, which polls on every
// route change. That route calls getAttentionItems, which always
// re-runs the full condition-driven sync (6+ kinds, including the
// batched recording-matching pass) regardless of the status filter —
// confirmed live this took 1.6s+ per call, meaning every single admin
// page navigation was paying that cost just to refresh a badge number,
// not because anything about the count actually needed a fresh sync
// that often. The real sync still happens whenever Needs Review or
// Overview is actually loaded — this only ever reads whatever's
// already in the table.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const { count } = await supabase
    .from("attention_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_action");

  return NextResponse.json({ count: count ?? 0 });
}
