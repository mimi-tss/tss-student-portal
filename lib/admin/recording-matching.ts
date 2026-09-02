import { SupabaseClient } from "@supabase/supabase-js";
import {
  listMeetRecordingsInbox,
  createDriveShortcut,
  findGeminiNotesForRecording,
  exportDocText,
} from "@/lib/google/drive";
import { zonedYearMonthDay } from "@/lib/timezone";
import { resolveAttentionItemsForRecording } from "@/lib/admin/attention-items";
import { notifyStudent } from "@/lib/notifications/create";

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
// row resolved — shared by every match path (auto day+session,
// auto name-in-notes, and an admin's manual pick), so a match always
// means the file actually moved, not just a DB flag. matched_student_id
// is the source of truth for "who this belongs to" regardless of path;
// sessionId is optional since a name-match may have no specific session
// to point to.
export async function attachRecordingToStudent(
  admin: SupabaseClient,
  recordingId: string,
  studentId: string,
  opts: { sessionId?: string | null; method: "day_session" | "name_in_notes" | "manual" },
): Promise<{ success: boolean; error?: string }> {
  const { data: recording } = await admin
    .from("meet_recordings")
    .select("drive_file_id, status")
    .eq("id", recordingId)
    .single();

  if (!recording || recording.status !== "unmatched") {
    return { success: false, error: "recording not found or already resolved" };
  }

  const { data: student } = await admin
    .from("students")
    .select("drive_folder_id, email, phone, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp")
    .eq("id", studentId)
    .single();
  if (!student?.drive_folder_id) {
    return { success: false, error: "that student has no Drive folder set up yet" };
  }

  // A shortcut, not a copy or a reparent — confirmed live that a plain
  // reparent (addParents/removeParents) fails outright ("insufficient
  // permissions"), since the inbox lives in the admin account's own My
  // Drive while student folders live in a Shared Drive, and Drive
  // won't let a reparent cross that boundary without an ownership
  // transfer. A copy-then-delete works around that too, but doubles
  // real video-file storage the moment it runs (Workspace trash still
  // counts against quota until emptied, and even a hard delete means
  // briefly holding two full copies) — a shortcut costs next to
  // nothing and needs no ownership change at all, since it's just a
  // small pointer object created fresh inside the student's folder.
  // Same createDriveShortcut() the "paste a Drive link" quick-add
  // already uses. Wrapped in try/catch — was unguarded before,
  // producing an opaque uncaught-exception 500 with no error text
  // anywhere on any failure.
  try {
    await createDriveShortcut(student.drive_folder_id, recording.drive_file_id);
  } catch (err) {
    return { success: false, error: err instanceof Error ? `couldn't link the file: ${err.message}` : "couldn't link the file" };
  }

  const { error } = await admin
    .from("meet_recordings")
    .update({
      status: "matched",
      matched_student_id: studentId,
      matched_session_id: opts.sessionId ?? null,
      match_method: opts.method,
      matched_at: new Date().toISOString(),
    })
    .eq("id", recordingId);

  if (error) return { success: false, error: error.message };
  await resolveAttentionItemsForRecording(admin, recordingId);

  await notifyStudent(admin, {
    studentId,
    email: student.email,
    phone: student.phone,
    group: "alerts",
    kind: "recording_ready",
    dedupKey: `student:${studentId}:recording_ready:${recordingId}`,
    title: "Your recording is ready",
    body: "Your session recording has been added to your shared folder.",
    linkUrl: "/student/dashboard",
    ghlData: { recordingId },
    channels: { email: student.notify_alerts_email, sms: student.notify_alerts_sms, inApp: student.notify_alerts_inapp },
  });

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
  await resolveAttentionItemsForRecording(admin, recordingId);
  return { success: true };
}

// Searches a Gemini notes doc's text for exactly one of a coach's
// students by full name — deliberately requires an unambiguous single
// hit (two names appearing, or none, both fall through to the manual
// queue) since a wrong auto-match here means moving a real recording
// into the wrong family's Drive folder.
interface StudentForMatching {
  id: string;
  name: string;
}

export function findStudentNameInText(text: string, students: StudentForMatching[]): string | null {
  const lower = text.toLowerCase();
  const hits = students.filter((s) => lower.includes(s.name.toLowerCase()));
  return hits.length === 1 ? hits[0].id : null;
}

// Name-based matching via each recording's paired Gemini notes doc —
// doesn't depend on sessions.status ever being marked 'attended' at
// all, unlike runDayMatching below, so it can resolve recordings the
// day+session path never will while attendance-marking isn't a habit
// yet at this studio. Only considers a coach's own current, active
// roster, and only trusts a notes doc once the coach's own email is
// confirmed present in it (the notes header always includes the
// meeting organizer's email) — guards against a same-timestamp
// coincidence pairing the wrong coach's notes to this recording.
//
// Two-pass, not one: first resolve every unmatched recording's paired
// notes doc without attaching anything, then only auto-match a notes
// doc that pairs to exactly ONE still-unmatched recording. Confirmed
// live this matters — a coach properly stopping and restarting the
// recording between two back-to-back students still leaves Gemini's
// notes as ONE shared doc covering both, so it names both students.
// If only one of the two happens to already exist in the active
// roster, a naive per-recording check finds a clean single hit for
// EACH file and confidently (and wrongly) attaches both files to that
// one known student. A notes doc shared across multiple still-unmatched
// files is itself the signal that it can't be trusted for any of them.
// Caps how many recordings one invocation processes — confirmed live
// this route was timing out (empty 500, no thrown/caught error of our
// own) under real backlog load, and that the failure point scales
// with batch size (26 recordings failed around 20-26s, 15 around
// 11-12s) rather than hitting a fixed wall — per-recording cost in
// the actual deployed environment is meaningfully higher than direct
// local measurement showed (~0.7s/recording live vs ~150-200ms
// measured locally, likely connection/auth overhead that doesn't
// reproduce in a single long-lived local process). 8 is a deliberately
// conservative margin below the smallest failure point actually
// observed. Oldest first, so a bounded per-call budget still sweeps
// the whole backlog forward across the cron's own repeated 2-hour
// runs rather than getting stuck reprocessing the same newest items.
const NAME_MATCH_BATCH_SIZE = 8;

export async function runNameMatching(admin: SupabaseClient): Promise<{ matched: number }> {
  const { data: unmatched } = await admin
    .from("meet_recordings")
    .select("id, coach_id, file_name, drive_created_at")
    .eq("status", "unmatched")
    .not("coach_id", "is", null)
    .order("drive_created_at", { ascending: true })
    .limit(NAME_MATCH_BATCH_SIZE);

  if (!unmatched?.length) return { matched: 0 };

  const coachIds = [...new Set(unmatched.map((r) => r.coach_id as string))];
  const [{ data: coaches }, { data: students }] = await Promise.all([
    admin.from("coaches").select("id, email").in("id", coachIds),
    admin
      .from("students")
      .select("id, name, assigned_coach_id")
      .eq("archived", false)
      .in("assigned_coach_id", coachIds),
  ]);

  const coachEmailById = new Map((coaches ?? []).map((c) => [c.id as string, (c.email as string).toLowerCase()]));
  const studentsByCoach = new Map<string, StudentForMatching[]>();
  for (const s of students ?? []) {
    const key = s.assigned_coach_id as string;
    const list = studentsByCoach.get(key) ?? [];
    list.push({ id: s.id, name: s.name });
    studentsByCoach.set(key, list);
  }

  // Pass 1: resolve each recording's paired notes doc (if any confirmed
  // for the right coach) without matching anything yet. Recordings run
  // in parallel — each is its own independent Drive lookup, and this
  // was previously one recording at a time (confirmed live: ~300-500ms
  // per recording, enough on its own to approach a serverless function's
  // duration limit once more than a couple dozen recordings are
  // unmatched at once). The inner "stop at the first confirmed
  // candidate" behavior per recording is unchanged.
  const resolvedOrNull = await Promise.all(
    unmatched.map(async (rec) => {
      const coachEmail = coachEmailById.get(rec.coach_id as string);
      if (!coachEmail) return null;

      const candidates = await findGeminiNotesForRecording(rec.file_name as string, rec.drive_created_at as string);
      for (const candidate of candidates) {
        const text = await exportDocText(candidate.id);
        if (text.toLowerCase().includes(coachEmail)) {
          return { recordingId: rec.id, coachId: rec.coach_id as string, notesDocId: candidate.id };
        }
      }
      return null;
    }),
  );
  const resolved = resolvedOrNull.filter(
    (r): r is { recordingId: string; coachId: string; notesDocId: string } => r !== null,
  );

  const recordingsPerNotesDoc = new Map<string, number>();
  for (const r of resolved) {
    recordingsPerNotesDoc.set(r.notesDocId, (recordingsPerNotesDoc.get(r.notesDocId) ?? 0) + 1);
  }

  // Pass 2: only act on notes docs uniquely paired to one recording.
  // Parallel for the same reason pass 1 is — each candidate here targets
  // its own distinct recording/student pair, so there's nothing shared
  // to race on. attachRecordingToStudent's own real Drive file MOVE
  // (not just a read) made this the slower half of the two passes when
  // it ran one at a time.
  const eligible = resolved.filter((r) => (recordingsPerNotesDoc.get(r.notesDocId) ?? 0) === 1);
  const outcomes = await Promise.all(
    eligible.map(async ({ recordingId, coachId, notesDocId }) => {
      const roster = studentsByCoach.get(coachId) ?? [];
      if (roster.length === 0) return false;

      const text = await exportDocText(notesDocId);
      const studentId = findStudentNameInText(text, roster);
      if (!studentId) return false;

      const result = await attachRecordingToStudent(admin, recordingId, studentId, { method: "name_in_notes" });
      return result.success;
    }),
  );

  return { matched: outcomes.filter(Boolean).length };
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

    const result = await attachRecordingToStudent(admin, recordingId, sameDaySessions[0].studentId, {
      sessionId: sameDaySessions[0].id,
      method: "day_session",
    });
    if (result.success) autoMatched++;
  }

  return { autoMatched };
}
