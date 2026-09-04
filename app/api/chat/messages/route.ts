import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyChatRecipient } from "@/lib/chat/notify";
import { coachHasAccessToStudent, getOrCreateThreadId } from "@/lib/chat/thread";

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
      participants[c.profile_id] = `Coach ${c.name.trim().split(/\s+/)[0]}`;
    }
    for (const s of studentSenders ?? []) {
      participants[s.profile_id] = s.name;
    }
    // Anyone left over isn't a coach or student — the only other role
    // that can send here (migration 0036) is admin. Cheaper and safer
    // than a profiles lookup, which RLS (0004) would block anyway for a
    // non-admin viewer trying to resolve who "Admin" is.
    for (const id of senderIds) {
      if (!participants[id]) participants[id] = "Admin";
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

  const [{ data: thread }, { data: senderCoach }, { data: senderStudent }] = await Promise.all([
    supabase.from("chat_threads").select("id").eq("student_id", studentId).maybeSingle(),
    supabase.from("coaches").select("id").eq("profile_id", user.id).maybeSingle(),
    supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle(),
  ]);
  const senderRole: "coach" | "student" | "admin" = senderCoach ? "coach" : senderStudent ? "student" : "admin";

  let threadId = thread?.id ?? null;

  // No thread yet — the only student this can legitimately happen for
  // is one who's never triggered the assigned-coach trigger (0013), most
  // commonly a group-lesson-only registrant (see 0092). Only a coach can
  // start one here, and only when they actually have real access to this
  // student (verified explicitly since chat_threads has no INSERT
  // policy for supabase-js to rely on) — a student can never spawn a
  // thread themselves, and admin's own behavior is unchanged (still 404s,
  // same as before this fix; not the reported gap).
  if (!threadId && senderCoach) {
    const admin = createAdminClient();
    const hasAccess = await coachHasAccessToStudent(admin, senderCoach.id, studentId);
    if (hasAccess) {
      threadId = await getOrCreateThreadId(admin, studentId, senderCoach.id);
    }
  }

  if (!threadId) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: user.id,
      body: body || null,
      attachment_url: attachmentUrl || null,
    })
    .select("id, sender_profile_id, body, attachment_url, created_at")
    .single();

  if (error) {
    // Raw Postgres error text (e.g. "canceling statement due to
    // statement timeout") was leaking straight to the chat UI — logged
    // here for real debugging, but the student/coach just sees a plain
    // "try again," not a database internals string they can't act on.
    console.error(`chat message insert failed for thread ${threadId}`, error);
    return NextResponse.json({ error: "Couldn't send that message — please try again." }, { status: 500 });
  }

  // Fire-and-forget — a notification-email hiccup shouldn't fail the
  // message send itself.
  notifyChatRecipient(threadId, senderRole, message.body).catch((err) =>
    console.error(`chat notification failed for thread ${threadId}`, err),
  );

  return NextResponse.json({ message });
}
