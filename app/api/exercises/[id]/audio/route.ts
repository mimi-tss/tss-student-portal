import { Readable } from "stream";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveFileStream } from "@/lib/google/drive";

// Streams a catalog exercise's audio through the server rather than
// handing the browser a Drive link — no filename/download affordance
// exposed. Access is proven the same way for a student, their coach, or
// admin: if RLS lets this query see even one exercise_assignments row
// for this exercise id, the caller is allowed to hear it (each role's
// SELECT policy on exercise_assignments already scopes this correctly —
// migration 0024).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { data: assignment } = await supabase
    .from("exercise_assignments")
    .select("id")
    .eq("exercise_id", id)
    .limit(1)
    .maybeSingle();

  if (!assignment) return new Response("forbidden", { status: 403 });

  const { data: exercise } = await supabase.from("exercises").select("mp3_url").eq("id", id).maybeSingle();
  if (!exercise) return new Response("not found", { status: 404 });

  try {
    const { stream, mimeType } = await getDriveFileStream(exercise.mp3_url);
    const webStream = Readable.toWeb(stream as Readable) as unknown as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "playback failed", { status: 500 });
  }
}
