import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ResolvedAccount {
  email: string;
  redirectPath: string;
}

// Single source of truth for "does this email belong to a real account,
// and where should they land" — shared by request-login-code (decide
// whether to send a code at all) and verify-login-code (decide where to
// redirect after a correct one). Checks students → coaches → admin/
// admin_finance, same order and same listUsers()-based admin lookup
// app/api/auth/request-login-link/route.ts used before being replaced by
// the code-entry flow (admin/admin_finance have no business-table email
// column, so that one still goes through auth.users — fine at this
// app's staff-account scale).
export async function resolveAccountByEmail(admin: AdminClient, rawEmail: string): Promise<ResolvedAccount | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return null;

  const { data: student } = await admin.from("students").select("email").ilike("email", email).maybeSingle();
  if (student) return { email: student.email, redirectPath: "/student/dashboard" };

  const { data: coach } = await admin.from("coaches").select("email").ilike("email", email).maybeSingle();
  if (coach) return { email: coach.email, redirectPath: "/coach/dashboard" };

  const { data: userList } = await admin.auth.admin.listUsers();
  const matchedUser = userList?.users.find((u) => u.email?.toLowerCase() === email);
  if (matchedUser) {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", matchedUser.id)
      .maybeSingle();
    if (profile?.role === "admin" || profile?.role === "admin_finance") {
      return { email, redirectPath: "/admin/overview" };
    }
  }

  return null;
}
