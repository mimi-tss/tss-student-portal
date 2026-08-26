import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Routes that check role explicitly in TypeScript (rather than relying
// purely on RLS's is_admin(), which migration 0046 already widened to
// admit admin_finance) need this same widened set — otherwise a
// hardcoded `role !== "admin"` check would 403 the Admin-Finance role
// out of pages it's supposed to have full parity on. admin_finance is a
// superset of admin (sees everything admin does, plus Finance/Reports —
// see lib/auth/require-role.ts's requireFinanceAccess for the only 2
// pages that actually differ between the two roles).
export const ADMIN_ROLES = ["admin", "admin_finance"] as const;

export function isAdminRole(role: string | null | undefined): boolean {
  return role != null && (ADMIN_ROLES as readonly string[]).includes(role);
}

// The inverse of ADMIN_ROLES for the money-specific routes — Finance/
// Payroll's own API surface (rollup, history, generate, mark-paid,
// export, the attendance-check endpoints) and coach pay-rate edits.
// These rely on RLS for read/write access (is_admin() admits both
// roles), so without this explicit check a plain "admin" hitting one of
// these URLs directly would still get real payroll numbers despite the
// Finance page itself redirecting them away.
export async function hasFinanceRole(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "admin_finance";
}
