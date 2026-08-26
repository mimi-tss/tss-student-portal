import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ResolvedAccount {
  email: string;
  redirectPath: string;
}

// listUsers() is paginated (50 per page by default) and there's no
// admin.getUserByEmail() in this SDK version — a single unpaginated call
// only searches the first page, so an admin account created after ~50
// other auth users (students, coaches, everyone) could silently never
// be found. Walk every page until a match turns up or the list runs out.
async function findAuthUserByEmail(admin: AdminClient, email: string) {
  let page = 1;
  const perPage = 200;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
    page++;
  }
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

  const matchedUser = await findAuthUserByEmail(admin, email);
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
