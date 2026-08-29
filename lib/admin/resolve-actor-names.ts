import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActorInfo {
  id: string;
  role: string;
  name: string;
}

// Batch-resolves profiles.id -> a human-readable name for the Activity
// Log's actor column. profiles itself has no name/email — those live
// on students.name/coaches.name (both keyed by profile_id), and
// admin/admin_finance accounts have no business-table row at all, only
// auth.users, so those fall back to a per-id lookup via the service-role
// client. Fine at this app's scale (single studio, a handful of admin
// accounts) — not worth the pagination workaround a larger admin roster
// would need.
export async function resolveActorNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorIds: (string | null)[],
): Promise<Map<string, ActorInfo>> {
  const ids = Array.from(new Set(actorIds.filter((id): id is string => !!id)));
  const map = new Map<string, ActorInfo>();
  if (ids.length === 0) return map;

  const { data: profiles } = await supabase.from("profiles").select("id, role").in("id", ids);
  const byRole = { student: [] as string[], coach: [] as string[], admin: [] as string[] };
  for (const p of profiles ?? []) {
    if (p.role === "student") byRole.student.push(p.id);
    else if (p.role === "coach") byRole.coach.push(p.id);
    else byRole.admin.push(p.id); // admin + admin_finance
  }

  if (byRole.student.length) {
    const { data } = await supabase.from("students").select("profile_id, name").in("profile_id", byRole.student);
    for (const s of data ?? []) {
      if (s.profile_id) map.set(s.profile_id, { id: s.profile_id, role: "student", name: s.name });
    }
  }
  if (byRole.coach.length) {
    const { data } = await supabase.from("coaches").select("profile_id, name").in("profile_id", byRole.coach);
    for (const c of data ?? []) {
      if (c.profile_id) map.set(c.profile_id, { id: c.profile_id, role: "coach", name: c.name });
    }
  }
  if (byRole.admin.length) {
    const admin = createAdminClient();
    for (const id of byRole.admin) {
      const { data } = await admin.auth.admin.getUserById(id);
      map.set(id, { id, role: "admin", name: data.user?.email ?? "Admin" });
    }
  }

  return map;
}
