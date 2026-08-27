import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

const NOTIFY_THROTTLE_MS = 15 * 60 * 1000;

// Generic "you have a new message" nudge (TSS_App_Spec_1.md section 9) —
// no message content or contact info exposed. No real in-app presence
// signal exists (chat is 4s-polling while mounted, nothing tracks
// "active right now"), so this is throttled to at most one email per
// recipient per thread per 15 minutes rather than a true
// active/inactive check — a deliberate simplification, not full spec
// compliance (see the plan's flagged assumptions).
async function notifyRecipient(threadId: string, senderIsCoach: boolean) {
  const admin = createAdminClient();
  const { data: thread } = await admin
    .from("chat_threads")
    .select(
      "student_id, coach_id, student_last_notified_at, coach_last_notified_at, students(name, email), coaches(name, email)",
    )
    .eq("id", threadId)
    .single();

  if (!thread) return;

  const now = new Date();
  const throttleColumn = senderIsCoach ? "student_last_notified_at" : "coach_last_notified_at";
  const lastNotified = senderIsCoach ? thread.student_last_notified_at : thread.coach_last_notified_at;

  if (lastNotified && now.getTime() - new Date(lastNotified).getTime() < NOTIFY_THROTTLE_MS) {
    return;
  }

  const recipient = senderIsCoach
    ? (thread.students as unknown as { name: string; email: string } | null)
    : (thread.coaches as unknown as { name: string; email: string } | null);
  const senderName = senderIsCoach
    ? (thread.coaches as unknown as { name: string } | null)?.name
    : (thread.students as unknown as { name: string } | null)?.name;

  if (!recipient?.email) return;

  await sendEmail(
    recipient.email,
    "New message on Tara Simon Studios",
    `<p>You have a new message from ${senderName ?? "your coach"} — log in to view and reply.</p>`,
  );

  await admin.from("chat_threads").update({ [throttleColumn]: now.toISOString() }).eq("id", threadId);
}

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

  const { data: senderCoach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  // Fire-and-forget — a notification-email hiccup shouldn't fail the
  // message send itself.
  notifyRecipient(thread.id, !!senderCoach).catch((err) =>
    console.error(`chat notification failed for thread ${thread.id}`, err),
  );

  return NextResponse.json({ message });
}
