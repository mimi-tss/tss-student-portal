import { google } from "googleapis";
import { getGoogleAuth, DRIVE_SCOPES } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth(DRIVE_SCOPES) });
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
// feeds the student dashboard's recordings view.
export async function listStudentRecordings(folderId: string) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    corpora: "allDrives",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: "files(id, name, mimeType, createdTime, webViewLink)",
    orderBy: "createdTime desc",
  });
  return res.data.files ?? [];
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
