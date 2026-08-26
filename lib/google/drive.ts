import { Readable } from "stream";
import { google } from "googleapis";
import { getGoogleAuth, DRIVE_SCOPES } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth(DRIVE_SCOPES) });
}

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
    q: `'${folderId}' in parents and trashed = false and mimeType contains 'audio/'`,
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
    q: `'${folderId}' in parents and trashed = false`,
    corpora: "allDrives",
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

// Uploads a file into a student's Drive folder — the shared folder,
// usable by the student themselves, their coach, or admin (all three
// per the coach-dashboard shared-folder spec). copyRequiresWriterPermission
// is set on every upload here to disable Drive's own download/copy/print
// affordances for viewer-only access — best-effort, not airtight (same
// honest framing as the Exercises Library: true un-downloadable content
// isn't fully achievable). Caller is responsible for confirming the
// folder actually belongs to the target student and the actor is allowed
// to write to it before calling this.
export async function uploadToStudentFolder(
  folderId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<StudentFolderFile> {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [folderId],
      copyRequiresWriterPermission: true,
    },
    media: {
      mimeType: file.mimeType,
      body: Readable.from(file.buffer),
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  return {
    id: res.data.id!,
    name: res.data.name ?? file.name,
    webViewLink: res.data.webViewLink ?? null,
    isShortcut: false,
  };
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

// Trashes (not permanently deletes) an item from a student's folder —
// recoverable, matching this app's general preference for reversible
// actions over hard deletes. Verifies the item is actually a direct
// child of the given folder first, so one student's "remove" request
// can't be pointed at an arbitrary Drive file id elsewhere.
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

  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
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
