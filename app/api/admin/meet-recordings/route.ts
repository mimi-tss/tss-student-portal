import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { scanForNewRecordings, runDayMatching, listCandidateSessions } from "@/lib/admin/recording-matching";

// Scans the shared Meet-recordings inbox on every load rather than on a
// timer — this app has no scheduled-job infrastructure of its own
// (materialize-recurring/kajabi-sync run via an external cron outside
// this repo, not something this session can wire a new one into), and
// an on-demand scan is simpler and gives the admin direct control over
// when it runs. The unmatched list this returns already reflects
// whatever the scan + auto-match pass just resolved.
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
  const { autoMatched } = await runDayMatching(admin);

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
