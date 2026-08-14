import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

// Verifies the logged-in user has the given role before rendering
// anything under a route group, redirecting to /login otherwise. Call
// from that route group's layout.tsx so every page under it is gated the
// same way. There's no password login form in this app — the only way in
// is the Kajabi-triggered magic link (app/api/auth/kajabi/login) — so a
// user landing here without a session just needs pointing back at their
// inbox, not a login form.
export async function requireRole(role: Role) {
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

  if (!profile || profile.role !== role) redirect("/login?error=unauthorized");

  return user;
}
