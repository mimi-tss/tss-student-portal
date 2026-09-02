import { Readable } from "stream";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveFileStream } from "@/lib/google/drive";

// This is the only route in the app that proxies a Drive file's actual
// bytes through a serverless function rather than just fetching Drive
// metadata (contrast app/api/admin/meet-recordings/rescan,
// app/api/cron/scan-recordings) — the whole streamed transfer counts
// against the function's execution time, not just the setup. No
// override here meant this ran on the platform default (10s on Hobby),
// which a several-minute exercise recording can plausibly exceed,
// cutting playback off silently mid-stream. Matches the 60s every other
// real-work route in this codebase already uses.
export const maxDuration = 60;

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
