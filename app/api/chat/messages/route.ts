import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Coach/student chat (spec section 9) — access is enforced by RLS
// (migration 0013): a thread only resolves for its own student, its own
// coach, or an admin. Anyone else gets a 404, not a leaked "forbidden".
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (!thread) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, sender_profile_id, body, attachment_url, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  // Resolved from the actual senders present in the history, not just
  // the thread's current single coach_id — a thread can carry messages
  // from any coach who's ever had access to this student (migration
  // 0022), and each needs correct attribution, not "Unknown".
  const senderIds = [...new Set((messages ?? []).map((m) => m.sender_profile_id))];
  const participants: Record<string, string> = {};

  if (senderIds.length > 0) {
    const [{ data: coachSenders }, { data: studentSenders }] = await Promise.all([
      supabase.from("coaches").select("name, profile_id").in("profile_id", senderIds),
      supabase.from("students").select("name, profile_id").in("profile_id", senderIds),
    ]);

    for (const c of coachSenders ?? []) {
      participants[c.profile_id] = `${c.name} (coach)`;
    }
    for (const s of studentSenders ?? []) {
      participants[s.profile_id] = s.name;
    }
  }

  return NextResponse.json({
    threadId: thread.id,
    participants,
    messages: messages ?? [],
  });
}

export async function POST(req: NextRequest) {
  const { studentId, body, attachmentUrl } = await req.json();

  if (!studentId || (!body && !attachmentUrl)) {
    return NextResponse.json(
      { error: "studentId and (body or attachmentUrl) required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (!thread) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: thread.id,
      sender_profile_id: user.id,
      body: body || null,
      attachment_url: attachmentUrl || null,
    })
    .select("id, sender_profile_id, body, attachment_url, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message });
}
