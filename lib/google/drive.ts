import { google } from "googleapis";
import { getGoogleAuth, DRIVE_SCOPES } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth(DRIVE_SCOPES) });
}

// Every student folder lives in this one shared drive. Confirmed live
// (2026-09-04, investigating a coach's "takes a minute to open" report)
// that this service account can see FIVE OTHER shared drives too —
// entirely unrelated businesses sharing the same Google Workspace
// account, not just this studio's own. Every call below that targets a
// student's own folder used to search `corpora: "allDrives"`, meaning
// every single one of those unrelated drives got enumerated too on
// every request — confirmed via a direct timing comparison that scoping
// to just this drive is meaningfully faster, and it's also the more
// correct scope regardless: a lookup for a specific known student
// folder never had any legitimate reason to search a stranger's
// business drive in the first place.
const STUDENT_DRIVES_ID = "0ACL0rzsmUC2iUk9PVA";

// Exercises Library catalog folder — the studio manages its contents by
// hand (add/remove audio files whenever the exercise set changes) and
// the app syncs off it rather than the studio going through an in-app
// upload form. Requires the same admin Workspace account
// (GOOGLE_ADMIN_EMAIL) this app already impersonates for everything else
// Drive-related to actually have access to the folder — same
// requirement as the "TSS Student Drives" shared drive above.
export interface DriveAudioFile {
  id: string;
  name: string;
}

export async function listAudioFilesInFolder(folderId: string): Promise<DriveAudioFile[]> {
  const drive = getDriveClient();
  const res = await drive.files.list({
    // `mimeType contains 'audio/'` alone misses real-world exercise
    // files recorded/exported as .mp4 (voice-memo and screen-recording
    // apps commonly save audio-only content in an mp4 container, which
    // Drive tags video/mp4 regardless of there being no video track) —
    // confirmed against the studio's actual exercises folder, which is
    // entirely .mp4. video/mp4 is explicitly admitted alongside audio/*
    // rather than switching the filter to filename extension, since a
    // genuine audio/* upload should keep working too.
    q: `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or mimeType = 'video/mp4')`,
    corpora: "allDrives",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: "files(id, name)",
    orderBy: "name",
  });
  return (res.data.files ?? [])
    .filter((f) => f.id)
    .map((f) => ({ id: f.id as string, name: f.name ?? "Untitled" }));
}

// Streams a Drive file's bytes directly through the server — used to
// play a catalog exercise without ever handing the browser a Drive link
// (which would expose Google's own download/view UI). Caller is
// responsible for verifying the requester is actually allowed to hear
// this file before calling.
export async function getDriveFileStream(fileId: string) {
  const drive = getDriveClient();
  const [meta, media] = await Promise.all([
    drive.files.get({ fileId, fields: "mimeType, name", supportsAllDrives: true }),
    drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" }),
  ]);

  return {
    stream: media.data as unknown as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType ?? "audio/mpeg",
    name: meta.data.name ?? "exercise",
  };
}

// Creates a folder named after the student, nested under the coach's own
// subfolder in the "TSS Student Drives" shared drive (confirmed live —
// contains Coach Nikki/Tara/Ivan/Celine subfolders; Coach Crissy's is
// missing as of this writing). Returns the new folder's ID.
export async function createStudentDriveFolder(
  coachFolderId: string,
  studentName: string,
): Promise<string> {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: studentName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [coachFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!res.data.id) throw new Error("Drive folder creation returned no id");
  return res.data.id;
}

// Lists recording files inside a student's Drive folder, newest first —
// feeds the student dashboard's recordings view and the shared-folder
// panel (coach/student/admin). shortcutDetails is only populated for
// shortcut items (see createDriveShortcut below), used to render a
// distinct icon/label for "linked from elsewhere in Drive" vs. a real
// uploaded file.
export interface StudentFolderFile {
  id: string;
  name: string;
  webViewLink: string | null;
  isShortcut: boolean;
}

export async function listStudentRecordings(folderId: string): Promise<StudentFolderFile[]> {
  const drive = getDriveClient();
  const res = await drive.files.list({
    // Excludes the "Archive" subfolder itself (see
    // removeStudentFolderItem) — a removed item's new home shouldn't
    // reappear as a stray folder row in this same listing.
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    corpora: "drive",
    driveId: STUDENT_DRIVES_ID,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: "files(id, name, mimeType, createdTime, webViewLink, shortcutDetails)",
    orderBy: "createdTime desc",
  });
  return (res.data.files ?? [])
    .filter((f) => f.id)
    .map((f) => ({
      id: f.id as string,
      name: f.name ?? "Untitled",
      webViewLink: f.webViewLink ?? null,
      isShortcut: !!f.shortcutDetails,
    }));
}

// Mints a one-time Google Drive "resumable upload session" URL and hands
// it back to the browser, which then PUTs the file's bytes STRAIGHT to
// Google — never through this app's own server. Replaces an earlier
// version that buffered the whole file into this serverless function's
// memory before relaying it to Drive itself: that meant (a) Vercel's own
// request-body size ceiling rejected anything past a few MB before our
// code even ran, and (b) a several-hundred-MB video could plausibly
// exceed the function's time/memory budget even if it did get through —
// confirmed as the actual cause of a real "video won't upload" report.
// This has no such ceiling: our server's only job is this fast,
// byte-free session-creation call: everything after it is a direct
// browser<->Google transfer.
//
// copyRequiresWriterPermission (disables Drive's own download/copy/print
// affordances for viewer-only access — best-effort, not airtight, same
// honest framing as the Exercises Library) and the `fields` requested on
// the session URL both have to be set at SESSION CREATION time, not by
// the browser's later PUT, since only this server call carries
// authorization — the browser's PUT that follows needs no Authorization
// header at all, the session URL itself is the credential.
//
// Caller is responsible for confirming the folder actually belongs to
// the target student and the actor is allowed to write to it before
// calling this.
export async function createResumableUploadSession(
  folderId: string,
  file: { name: string; mimeType: string },
): Promise<string> {
  const auth = getGoogleAuth(DRIVE_SCOPES);
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error("could not authenticate with Google Drive");

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": file.mimeType,
      },
      body: JSON.stringify({
        name: file.name,
        parents: [folderId],
        copyRequiresWriterPermission: true,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`could not start an upload session (${res.status}): ${await res.text()}`);
  }

  const sessionUrl = res.headers.get("Location");
  if (!sessionUrl) throw new Error("Drive didn't return an upload session URL");
  return sessionUrl;
}

// Extracts a Drive file/folder id from any of the URL shapes Drive's
// "Share" UI produces (/file/d/{id}/view, /open?id={id}, ?id={id}, or a
// bare id typed directly) — feeds the shared-folder panel's "paste a
// Drive link" quick-add.
export function parseDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  const pathMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (pathMatch) return pathMatch[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryMatch) return queryMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

// Creates a shortcut inside a student's folder pointing at a file that
// lives elsewhere in Drive — the fast "paste a link, it becomes a
// shortcut" path instead of digging through folders manually. Doesn't
// move or copy the underlying file.
export async function createDriveShortcut(
  folderId: string,
  targetFileId: string,
): Promise<StudentFolderFile> {
  const drive = getDriveClient();

  const target = await drive.files.get({
    fileId: targetFileId,
    fields: "name",
    supportsAllDrives: true,
  });

  const res = await drive.files.create({
    requestBody: {
      name: target.data.name ?? "Shared file",
      mimeType: "application/vnd.google-apps.shortcut",
      parents: [folderId],
      shortcutDetails: { targetId: targetFileId },
      copyRequiresWriterPermission: true,
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  return {
    id: res.data.id!,
    name: res.data.name ?? "Shared file",
    webViewLink: res.data.webViewLink ?? null,
    isShortcut: true,
  };
}

// Finds (or creates once) the "Archive" subfolder inside a student's
// own Drive folder — no new students column needed, always derivable
// from the student's existing drive_folder_id on demand.
async function getOrCreateArchiveFolder(studentFolderId: string): Promise<string> {
  const drive = getDriveClient();
  const existing = await drive.files.list({
    q: `'${studentFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = 'Archive'`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "drive",
    driveId: STUDENT_DRIVES_ID,
    fields: "files(id)",
  });
  const found = existing.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: {
      name: "Archive",
      mimeType: "application/vnd.google-apps.folder",
      parents: [studentFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error("Archive folder creation returned no id");
  return created.data.id;
}

// Moves (never trashes, never permanently deletes) an item out of a
// student's main folder into that student's own "Archive" subfolder —
// recordings in particular are the studio's own record of what
// actually happened in a lesson, so a student (or coach/admin) removing
// one from view must never actually lose it, and shouldn't depend on
// Google's own 30-day shared-drive trash retention either (confirmed
// directly: a student's own accidental/mistaken removal must stay
// recoverable indefinitely, not just for a month). Verifies the item is
// actually a direct child of the given folder first, so one student's
// "remove" request can't be pointed at an arbitrary Drive file id
// elsewhere.
export async function removeStudentFolderItem(folderId: string, fileId: string): Promise<void> {
  const drive = getDriveClient();
  const file = await drive.files.get({
    fileId,
    fields: "parents",
    supportsAllDrives: true,
  });

  if (!file.data.parents?.includes(folderId)) {
    throw new Error("file does not belong to this folder");
  }

  const archiveFolderId = await getOrCreateArchiveFolder(folderId);
  await drive.files.update({
    fileId,
    addParents: archiveFolderId,
    removeParents: folderId,
    supportsAllDrives: true,
  });
}

// Meet's fixed auto-save destination for every recording made under the
// admin account (GOOGLE_ADMIN_EMAIL) — confirmed live: every coach's
// recordings (Celine, Ivan, Nikki, Tara) land here regardless of whose
// persistent room recorded it, since Meet's recording destination is
// per-organizer-account, not per-room. There is no Workspace admin
// setting on this account's plan to redirect it elsewhere (confirmed by
// reviewing the actual Meet admin console — no "recording file
// location" option present on this edition), so this is the one place
// to watch for new recordings.
export const MEET_RECORDINGS_INBOX_FOLDER_ID = "1TU_dSfCkJvzcUswFHb-MDQ5c8VMA3ZUd";

export interface MeetRecordingFile {
  id: string;
  name: string;
  createdTime: string;
}

// How far back the scan looks for "new" recordings — this folder is
// the studio's entire Meet recording history in one place (confirmed
// live: 4000+ files going back to January 2025, since Meet never moves
// or archives anything on its own). Without a bound, a full scan finds
// every file ever recorded as "new" the moment meet_recordings has no
// row for it yet — confirmed the hard way: an unbounded scan dumped
// 4000+ historical rows into meet_recordings in one call, which then
// made the Recordings page try to run name/day-matching (Drive+Gemini
// API calls) against the entire backlog on its next load. 3 days
// comfortably covers Meet's own multi-hour processing delay
// (RECORDING_GRACE_HOURS elsewhere) with margin, while keeping this
// permanently forward-looking regardless of how the query above is
// implemented (pagination, page size, etc.).
const RECORDING_SCAN_LOOKBACK_DAYS = 3;

// Lists recent recordings sitting in the shared Meet-recordings inbox —
// feeds lib/admin/recording-matching.ts's scan step, which diffs this
// against meet_recordings.drive_file_id to find newly-arrived files.
export async function listMeetRecordingsInbox(): Promise<MeetRecordingFile[]> {
  const drive = getDriveClient();
  const cutoff = new Date(Date.now() - RECORDING_SCAN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const res = await drive.files.list({
    q: `'${MEET_RECORDINGS_INBOX_FOLDER_ID}' in parents and trashed = false and mimeType = 'video/mp4' and createdTime > '${cutoff}'`,
    orderBy: "createdTime desc",
    pageSize: 200,
    fields: "files(id, name, createdTime)",
  });
  return (res.data.files ?? [])
    .filter((f) => f.id && f.createdTime)
    .map((f) => ({ id: f.id as string, name: f.name ?? "Untitled", createdTime: f.createdTime as string }));
}

// A recording's own filename time (parsed separately) tells us when the
// *meeting* happened; Gemini's notes doc for that same meeting is what
// actually names the student, so pairing the two is what makes
// name-based matching possible.
//
// Prefer matching on the shared "YYYY/MM/DD HH:MM EDT" label text when
// the recording has one — confirmed live this is exact and reliable.
// Creation-time proximity alone is NOT reliable: confirmed live it can
// grab a completely different meeting's notes doc, since a notes doc's
// own processing lag doesn't track its recording's independently (a
// notes doc created "close in time" to this recording can belong to a
// different meeting hours off by its own label). Time-proximity is only
// the fallback, for a not-yet-processed recording that's still just a
// raw meeting code with no shared label text to search on at all.
export interface GeminiNotesCandidate {
  id: string;
  name: string;
}

const LABEL_PATTERN = /\d{4}\/\d{2}\/\d{2} \d{2}:\d{2} EDT/;

export async function findGeminiNotesForRecording(
  recordingFileName: string,
  recordingCreatedTime: string,
): Promise<GeminiNotesCandidate[]> {
  const drive = getDriveClient();
  const labelMatch = recordingFileName.match(LABEL_PATTERN);

  if (labelMatch) {
    const res = await drive.files.list({
      q: `'${MEET_RECORDINGS_INBOX_FOLDER_ID}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.document' and name contains '${labelMatch[0]}'`,
      fields: "files(id, name)",
      pageSize: 5,
    });
    const exact = (res.data.files ?? []).filter((f) => f.id);
    if (exact.length > 0) {
      return exact.map((f) => ({ id: f.id as string, name: f.name ?? "Untitled" }));
    }
  }

  const windowMinutes = 20;
  const center = new Date(recordingCreatedTime).getTime();
  const start = new Date(center - windowMinutes * 60 * 1000).toISOString();
  const end = new Date(center + windowMinutes * 60 * 1000).toISOString();
  const res = await drive.files.list({
    q: `'${MEET_RECORDINGS_INBOX_FOLDER_ID}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.document' and name contains 'Notes by Gemini' and createdTime > '${start}' and createdTime < '${end}'`,
    fields: "files(id, name)",
    pageSize: 10,
  });
  return (res.data.files ?? [])
    .filter((f) => f.id)
    .map((f) => ({ id: f.id as string, name: f.name ?? "Untitled" }));
}

// Exports a Google Doc's plain-text content — used to search a Gemini
// notes doc for whichever student's name appears in it, and to confirm
// the notes doc actually belongs to the expected coach (the notes doc
// header includes the meeting organizer's email) before trusting
// anything it says.
export async function exportDocText(fileId: string): Promise<string> {
  const drive = getDriveClient();
  const res = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
  return res.data as unknown as string;
}

// Creates (once) a student's Drive folder nested under their assigned
// coach's subfolder, and saves the folder ID onto the student record.
// Called from every path that can set assigned_coach_id — a fresh Kajabi
// purchase never has a coach yet (assigned separately by admin
// afterward), so folder creation can't happen at provisioning time
// alone for most students. No-ops if the student already has a folder,
// doesn't have a coach yet, or that coach doesn't have their own Drive
// subfolder configured.
export async function ensureStudentDriveFolder(studentId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: student } = await admin
    .from("students")
    .select("name, assigned_coach_id, drive_folder_id")
    .eq("id", studentId)
    .single();

  if (!student || student.drive_folder_id || !student.assigned_coach_id) return;

  const { data: coach } = await admin
    .from("coaches")
    .select("drive_folder_id")
    .eq("id", student.assigned_coach_id)
    .single();

  if (!coach?.drive_folder_id) return;

  try {
    const folderId = await createStudentDriveFolder(coach.drive_folder_id, student.name);
    await admin.from("students").update({ drive_folder_id: folderId }).eq("id", studentId);
  } catch (err) {
    // Don't let a Drive hiccup break provisioning or coach assignment —
    // the folder can be created on a later retry (e.g. next time this
    // function runs for the student), it doesn't have to happen inline.
    console.error(`ensureStudentDriveFolder failed for student ${studentId}`, err);
  }
}
