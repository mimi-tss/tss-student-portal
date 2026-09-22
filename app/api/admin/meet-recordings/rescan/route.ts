import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  // Optional `days` override for a one-time historical catch-up (e.g.
  // the 2026-09-10 Drive restructure — see MEET_RECORDINGS_INBOX_FOLDER_ID's
  // own comment — went undetected long enough that the ordinary 3-day
  // rolling window couldn't reach back far enough once found). This is
  // the only admin-reachable way to trigger that: the cron route's own
  // equivalent needs CRON_SECRET, and Vercel's "Sensitive" env vars are
  // write-only after being set — nobody, including whoever set it, can
  // read that value back out to run it manually. Real admin auth above
  // is the actual gate here, same as every other admin route.
  const { days } = await req.json().catch(() => ({ days: undefined }));
  const lookbackDays = typeof days === "number" && days > 0 ? days : undefined;

  const admin = createAdminClient();
  const { inserted } = await scanForNewRecordings(admin, lookbackDays);
  const { matched: nameMatched } = await runNameMatching(admin);
  const { autoMatched: dayMatched } = await runDayMatching(admin);

  return NextResponse.json({ inserted, autoMatched: nameMatched + dayMatched });
}
