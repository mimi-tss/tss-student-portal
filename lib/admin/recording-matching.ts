import { SupabaseClient } from "@supabase/supabase-js";
import {
  listMeetRecordingsInbox,
  moveFileToStudentFolder,
  MEET_RECORDINGS_INBOX_FOLDER_ID,
} from "@/lib/google/drive";
import { zonedYearMonthDay } from "@/lib/timezone";

interface CoachForMatching {
  id: string;
  name: string;
  timezone: string;
  meet_link: string | null;
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function meetCode(meetLink: string | null): string | null {
  if (!meetLink) return null;
  const match = meetLink.match(/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})/i);
  return match ? match[1].toLowerCase() : null;
}

// Two naming schemes show up in practice: a raw, not-yet-processed file
// is just the meeting code ("fyj-rnyj-hvq (...)"), while a fully
// processed one is renamed to the room's own label ("Coach Celine's
// Personal Meeting Link - ... - Recording"). Try the code first — it's
// the more reliable signal, and works before Meet finishes renaming —
// then fall back to a first-name match against the studio's small,
// fixed coach roster.
export function identifyCoach(fileName: string, coaches: CoachForMatching[]): string | null {
  const lowerName = fileName.toLowerCase();

  for (const coach of coaches) {
    const code = meetCode(coach.meet_link);
    if (code && lowerName.includes(code)) return coach.id;
  }
  for (const coach of coaches) {
    const firstName = coach.name.split(" ")[0]?.toLowerCase();
    if (firstName && firstName.length > 2 && lowerName.includes(firstName)) return coach.id;
  }
  return null;
}

// Diffs the shared Meet-recordings inbox against what's already tracked
// and inserts rows for anything new. recorded_date is computed in the
// owning coach's own timezone (falls back to Eastern if the coach
// couldn't be identified from the filename) — see the migration's own
// comment for why this has to be a calendar day, not a raw timestamp.
export async function scanForNewRecordings(admin: SupabaseClient): Promise<{ inserted: number }> {
  const [{ data: coaches }, files] = await Promise.all([
    admin.from("coaches").select("id, name, timezone, meet_link"),
    listMeetRecordingsInbox(),
  ]);

  if (!files.length) return { inserted: 0 };

  const { data: existing } = await admin
    .from("meet_recordings")
    .select("drive_file_id")
    .in("drive_file_id", files.map((f) => f.id));
  const existingIds = new Set((existing ?? []).map((r) => r.drive_file_id as string));

  const newFiles = files.filter((f) => !existingIds.has(f.id));
  if (!newFiles.length) return { inserted: 0 };

  const coachList = (coaches ?? []) as CoachForMatching[];
  const rows = newFiles.map((f) => {
    const coachId = identifyCoach(f.name, coachList);
    const coach = coachList.find((c) => c.id === coachId);
    const [y, m, d] = zonedYearMonthDay(new Date(f.createdTime), coach?.timezone ?? "America/New_York");
    return {
      coach_id: coachId,
      drive_file_id: f.id,
      file_name: f.name,
      recorded_date: dateKey(y, m, d),
      drive_created_at: f.createdTime,
    };
  });

  const { error } = await admin.from("meet_recordings").insert(rows);
  if (error) throw error;
  return { inserted: rows.length };
}

// Moves the file into the matched student's own folder and marks the
// row resolved — shared by both the automatic 1:1 path (runDayMatching)
// and an admin's manual pick, so a match always means the file actually
// moved, not just a DB flag.
export async function attachRecordingToSession(
  admin: SupabaseClient,
  recordingId: string,
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: recording } = await admin
    .from("meet_recordings")
    .select("drive_file_id, status")
    .eq("id", recordingId)
    .single();

  if (!recording || recording.status !== "unmatched") {
    return { success: false, error: "recording not found or already resolved" };
  }

  const { data: session } = await admin
    .from("sessions")
    .select("id, students(drive_folder_id)")
    .eq("id", sessionId)
    .single();

  const driveFolderId = (session?.students as unknown as { drive_folder_id: string | null } | null)?.drive_folder_id;
  if (!session || !driveFolderId) {
    return { success: false, error: "that student has no Drive folder set up yet" };
  }

  await moveFileToStudentFolder(recording.drive_file_id, MEET_RECORDINGS_INBOX_FOLDER_ID, driveFolderId);

  const { error } = await admin
    .from("meet_recordings")
    .update({ status: "matched", matched_session_id: sessionId, matched_at: new Date().toISOString() })
    .eq("id", recordingId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function dismissRecording(
  admin: SupabaseClient,
  recordingId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await admin
    .from("meet_recordings")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", recordingId)
    .eq("status", "unmatched");

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Attended sessions for a coach on one calendar day that don't already
// have a recording matched to them — the candidate pool both the
// auto-match pass and the manual queue picker draw from. Shared so the
// two can't drift into different definitions of "candidate."
export async function listCandidateSessions(
  admin: SupabaseClient,
  coachId: string,
  date: string,
  timezone: string,
  excludeSessionIds: Set<string>,
): Promise<{ id: string; scheduledAt: string; studentId: string; studentName: string }[]> {
  const rangeStart = new Date(`${date}T00:00:00Z`);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(`${date}T00:00:00Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 2);

  const { data } = await admin
    .from("sessions")
    .select("id, scheduled_at, student_id, students(name)")
    .eq("actual_coach_id", coachId)
    .eq("status", "attended")
    .gte("scheduled_at", rangeStart.toISOString())
    .lt("scheduled_at", rangeEnd.toISOString());

  return (data ?? [])
    .filter((s) => !excludeSessionIds.has(s.id))
    .filter((s) => {
      const [y, m, d] = zonedYearMonthDay(new Date(s.scheduled_at), timezone);
      return dateKey(y, m, d) === date;
    })
    .map((s) => ({
      id: s.id,
      scheduledAt: s.scheduled_at,
      studentId: s.student_id,
      studentName: (s.students as unknown as { name: string } | null)?.name ?? "Unknown student",
    }));
}

// Auto-resolves the unambiguous case only: exactly one unmatched
// recording AND exactly one attended, not-yet-matched session for that
// coach on that calendar day. Anything else (a second student that day,
// a coach-only meeting with no session at all, two recordings on the
// same day) is deliberately left for a human to pick in the queue —
// see the conversation this was scoped from: an internal meeting
// recording must never get force-paired with an unrelated student.
export async function runDayMatching(admin: SupabaseClient): Promise<{ autoMatched: number }> {
  const [{ data: unmatched }, { data: coaches }, { data: alreadyMatched }] = await Promise.all([
    admin
      .from("meet_recordings")
      .select("id, coach_id, recorded_date")
      .eq("status", "unmatched")
      .not("coach_id", "is", null),
    admin.from("coaches").select("id, timezone"),
    admin.from("meet_recordings").select("matched_session_id").eq("status", "matched"),
  ]);

  if (!unmatched?.length) return { autoMatched: 0 };

  const timezoneByCoach = new Map((coaches ?? []).map((c) => [c.id as string, c.timezone as string]));
  const alreadyMatchedSessionIds = new Set(
    (alreadyMatched ?? []).map((r) => r.matched_session_id as string).filter(Boolean),
  );

  const groups = new Map<string, { id: string; coachId: string; date: string }[]>();
  for (const rec of unmatched) {
    const key = `${rec.coach_id}|${rec.recorded_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id: rec.id, coachId: rec.coach_id as string, date: rec.recorded_date as string });
  }

  let autoMatched = 0;
  for (const recordings of groups.values()) {
    if (recordings.length !== 1) continue;
    const { id: recordingId, coachId, date } = recordings[0];
    const timezone = timezoneByCoach.get(coachId) ?? "America/New_York";

    const sameDaySessions = await listCandidateSessions(admin, coachId, date, timezone, alreadyMatchedSessionIds);
    if (sameDaySessions.length !== 1) continue;

    const result = await attachRecordingToSession(admin, recordingId, sameDaySessions[0].id);
    if (result.success) autoMatched++;
  }

  return { autoMatched };
}
