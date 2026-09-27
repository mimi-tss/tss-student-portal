import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// For admin API routes that write with the service-role client (so RLS
// alone doesn't gate them): the signed-in user's profile id if they're an
// admin, else null.
export async function requireAdminProfileId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return isAdminRole(profile?.role) ? user.id : null;
}
