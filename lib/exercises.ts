import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAudioFilesInFolder } from "@/lib/google/drive";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface AssignedExercise {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  audioUrl: string | null;
}

// Exercises Library (TSS_App_Spec_1.md section 10) — delivered via an
// in-app player, no visible download button, no direct file URL exposed.
// audioUrl now points at the same-origin streaming proxy
// (app/api/exercises/[id]/audio), which re-verifies access via RLS
// before streaming the Drive file's bytes — no signed URL or Drive link
// is ever handed to the browser.
export async function listAssignedExercises(
  supabase: SupabaseClient,
  studentId: string,
): Promise<AssignedExercise[]> {
  const { data: assignments } = await supabase
    .from("exercise_assignments")
    .select("id, exercise_id, exercises(id, title, description, category)")
    .eq("student_id", studentId)
    .order("assigned_at", { ascending: false });

  if (!assignments || assignments.length === 0) return [];

  return assignments.map((a) => {
    const exercise = a.exercises as unknown as {
      id: string;
      title: string;
      description: string | null;
      category: string | null;
    } | null;

    if (!exercise) {
      return { id: a.id, title: "Exercise", description: null, category: null, audioUrl: null };
    }

    return {
      id: a.id,
      title: exercise.title,
      description: exercise.description,
      category: exercise.category,
      audioUrl: `/api/exercises/${exercise.id}/audio`,
    };
  });
}

export interface ExercisesSyncResult {
  added: number;
  deactivated: number;
  total: number;
}

// The studio manages the catalog by adding/removing audio files directly
// in a shared Drive folder — this pulls that folder's current file list
// and reconciles it against the `exercises` table (mp3_url stores the
// Drive file id). Never hard-deletes a row: exercise_assignments has a
// not-null FK to exercises, so a student who already has something
// assigned keeps seeing it even after the studio removes the source file
// from Drive — it just drops out of the catalog/assign-dropdown (active
// = false) rather than breaking their history.
export async function syncExercisesFromDrive(folderId: string): Promise<ExercisesSyncResult> {
  const admin = createAdminClient();
  const driveFiles = await listAudioFilesInFolder(folderId);
  const driveIds = new Set(driveFiles.map((f) => f.id));

  const { data: existing } = await admin.from("exercises").select("id, mp3_url, active");
  const existingByDriveId = new Map((existing ?? []).map((e) => [e.mp3_url, e]));

  let added = 0;
  let deactivated = 0;

  for (const file of driveFiles) {
    const row = existingByDriveId.get(file.id);
    if (!row) {
      await admin.from("exercises").insert({ title: file.name.replace(/\.[^.]+$/, ""), mp3_url: file.id, active: true });
      added++;
    } else if (!row.active) {
      await admin.from("exercises").update({ active: true }).eq("id", row.id);
    }
  }

  for (const row of existing ?? []) {
    if (row.active && !driveIds.has(row.mp3_url)) {
      await admin.from("exercises").update({ active: false }).eq("id", row.id);
      deactivated++;
    }
  }

  return { added, deactivated, total: driveFiles.length };
}
