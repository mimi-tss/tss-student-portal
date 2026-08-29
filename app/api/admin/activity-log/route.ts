import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";
import { resolveActorNames } from "@/lib/admin/resolve-actor-names";

const PAGE_SIZE = 50;

// Two independently-paginated views (?view=changes|events) rather than
// one merged feed — audit_log (row diffs, trigger-captured) and
// activity_events (logins/join-clicks, app-inserted) are differently
// shaped, and merging them into one sorted/paginated feed needs
// cross-table keyset pagination for no real UX gain at this app's
// scale. Explicit role check here in addition to each table's own
// is_admin() RLS policy — same dual-layer posture Finance/Reports use
// (hasFinanceRole check + RLS underneath) since this is sensitive data.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const view = params.get("view") === "events" ? "events" : "changes";
  const start = params.get("start");
  const end = params.get("end");
  const actorId = params.get("actorId");
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const table = view === "changes" ? "audit_log" : "activity_events";
  const dateColumn = view === "changes" ? "changed_at" : "occurred_at";

  let query = supabase.from(table).select("*", { count: "exact" }).order(dateColumn, { ascending: false });

  if (view === "changes") {
    const tableFilter = params.get("table");
    const action = params.get("action");
    if (tableFilter && tableFilter !== "all") query = query.eq("table_name", tableFilter);
    if (action && action !== "all") query = query.eq("action", action);
  } else {
    const eventType = params.get("eventType");
    if (eventType && eventType !== "all") query = query.eq("event_type", eventType);
  }
  if (actorId) query = query.eq("actor_id", actorId);
  if (start) query = query.gte(dateColumn, start);
  if (end) query = query.lte(dateColumn, end);
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const actorMap = await resolveActorNames(
    supabase,
    rows.map((r) => r.actor_id as string | null),
  );
  const enriched = rows.map((r) => ({
    ...r,
    actorName: r.actor_id ? (actorMap.get(r.actor_id as string)?.name ?? "Unknown") : "System",
  }));

  return NextResponse.json({ rows: enriched, total: count ?? 0, page, pageSize: PAGE_SIZE });
}
