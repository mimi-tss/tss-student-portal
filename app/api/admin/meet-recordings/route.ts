import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import {
  scanForNewRecordings,
  runNameMatching,
  runDayMatching,
  listCandidateSessions,
} from "@/lib/admin/recording-matching";

// Scans the shared Meet-recordings inbox on every load rather than on a
// timer — this app has no scheduled-job infrastructure of its own
// (materialize-recurring/kajabi-sync run via an external cron outside
// this repo, not something this session can wire a new one into), and
// an on-demand scan is simpler and gives the admin direct control over
// when it runs. The unmatched list this returns already reflects
// whatever the scan + auto-match pass just resolved.
//
// Needs real runway: runNameMatching alone does 1-2 Drive API calls per
// unmatched recording, sequentially — confirmed live, ~300-500ms each,
// so even a few dozen recordings adds up past Vercel's default 10s
// function timeout (a request that just silently times out, same
// failure shape this route's own client never used to check for
// either). Matches the same maxDuration pattern already used for
// attention-items' own multi-query sync.
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const admin = createAdminClient();
  await scanForNewRecordings(admin);
  // Name-matching first — it doesn't depend on attendance ever being
  // marked (day+session matching does), so it resolves more real cases
  // at this studio right now. Day+session still runs after as a
  // fallback for whatever name-matching couldn't resolve (no Gemini
  // notes doc, ambiguous names).
  const { matched: nameMatched } = await runNameMatching(admin);
  const { autoMatched: dayMatched } = await runDayMatching(admin);
  const autoMatched = nameMatched + dayMatched;

  const [{ data: unmatched }, { data: matchedRows }] = await Promise.all([
    admin
      .from("meet_recordings")
      .select("id, coach_id, file_name, recorded_date, drive_created_at, coaches(name)")
      .eq("status", "unmatched")
      .order("recorded_date", { ascending: false }),
    admin.from("meet_recordings").select("matched_session_id").eq("status", "matched"),
  ]);

  const alreadyMatchedSessionIds = new Set(
    (matchedRows ?? []).map((r) => r.matched_session_id as string).filter(Boolean),
  );

  const { data: coaches } = await admin.from("coaches").select("id, timezone");
  const timezoneByCoach = new Map((coaches ?? []).map((c) => [c.id as string, c.timezone as string]));

  const items = await Promise.all(
    (unmatched ?? []).map(async (rec) => {
      const coachName = (rec.coaches as unknown as { name: string } | null)?.name ?? null;
      const candidates = rec.coach_id
        ? await listCandidateSessions(
            admin,
            rec.coach_id,
            rec.recorded_date,
            timezoneByCoach.get(rec.coach_id) ?? "America/New_York",
            alreadyMatchedSessionIds,
          )
        : [];
      return {
        id: rec.id,
        fileName: rec.file_name,
        recordedDate: rec.recorded_date,
        driveCreatedAt: rec.drive_created_at,
        coachId: rec.coach_id,
        coachName,
        candidates,
      };
    }),
  );

  return NextResponse.json({ items, autoMatched });
}
