import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

// Verifies the logged-in user has one of the given roles before
// rendering anything under a route group, redirecting to /login
// otherwise. Call from that route group's layout.tsx so every page
// under it is gated the same way. There's no password login form in
// this app — the only way in is the Kajabi-triggered magic link
// (app/api/auth/kajabi/login) — so a user landing here without a
// session just needs pointing back at their inbox, not a login form.
// Returns the resolved role too, since callers with more than one
// allowed role (the (admin) layout, which admits both "admin" and
// "admin_finance" — admin_finance is a superset of admin, not a
// separate restricted account; see requireFinanceAccess below for the
// only 2 pages that actually differ between the two) need to know
// which one it actually was.
export async function requireRole(role: Role | Role[]) {
  const allowed = Array.isArray(role) ? role : [role];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?error=not_logged_in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !allowed.includes(profile.role as Role)) redirect("/login?error=unauthorized");

  return { user, role: profile.role as Role };
}

// For the 2 money-specific admin pages (Finance, Reports) — the only
// two things a plain "admin" is deliberately NOT granted (everything
// else in /admin is shared by both roles). The (admin) layout already
// let plain "admin" past its own gate, so this can't redirect to
// /login (that would incorrectly boot a legitimately logged-in user);
// it sends them back to Overview instead.
export async function requireFinanceAccess(redirectTo = "/admin/overview") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=not_logged_in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin_finance") redirect(redirectTo);
}
