import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { scanForNewRecordings, runNameMatching, runDayMatching } from "@/lib/admin/recording-matching";

// The slow scan + auto-match pass, split out of the main GET route
// (see that route's own comment) so a manual "check now" doesn't block
// the page's normal load — same work the background cron
// (/api/cron/scan-recordings) already does every 2 hours, just
// available on demand too.
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const admin = createAdminClient();
  const { inserted } = await scanForNewRecordings(admin);
  const { matched: nameMatched } = await runNameMatching(admin);
  const { autoMatched: dayMatched } = await runDayMatching(admin);

  return NextResponse.json({ inserted, autoMatched: nameMatched + dayMatched });
}
