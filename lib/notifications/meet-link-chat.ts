import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateThreadId } from "@/lib/chat/thread";
import { notifyChatRecipient } from "@/lib/chat/notify";

// Safety net for the Join button — confirmed live (2026-09-10) that a
// scripted/popup navigation can silently fail in some real client while
// a plain chat link the coach pastes always works. Rather than rely on
// someone remembering to paste it after the button already failed,
// send it automatically, every session/group lesson, at the same
// EARLY_JOIN_MINUTES=10 moment the Join button itself becomes
// clickable (join-button.tsx) — the student always has a working link
// in chat by the time they'd try to use it, whether or not the button
// cooperates in their particular browser.
type Admin = ReturnType<typeof createAdminClient>;

function meetLinkBody(meetLink: string): string {
  return `Here's your Meet link for today's session: ${meetLink}`;
}

// De-dupes by checking for that exact body already in the thread rather
// than a dedicated log table — the body is deterministic per
// session/lesson (same coach meet_link every time), so an identical
// recent message IS the same reminder, not a coincidence. A generous
// 2-hour lookback comfortably covers the 10-minute cron window plus any
// retry, without needing new schema for what's a one-line send.
async function alreadySent(admin: Admin, threadId: string, body: string): Promise<boolean> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("chat_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("body", body)
    .gte("created_at", twoHoursAgo)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function sendMeetLinkMessage(admin: Admin, studentId: string, coachId: string, coachProfileId: string, meetLink: string) {
  const threadId = await getOrCreateThreadId(admin, studentId, coachId);
  const body = meetLinkBody(meetLink);

  if (await alreadySent(admin, threadId, body)) return false;

  const { error } = await admin.from("chat_messages").insert({
    thread_id: threadId,
    sender_profile_id: coachProfileId,
    body,
  });
  if (error) {
    console.error(`meet-link chat send failed for student ${studentId}`, error);
    return false;
  }

  notifyChatRecipient(threadId, "coach", body).catch((err) =>
    console.error(`meet-link chat notification failed for thread ${threadId}`, err),
  );
  return true;
}

interface SessionForMeetLink {
  student_id: string;
  actual_coach_id: string;
  coaches: { meet_link: string | null; profile_id: string } | { meet_link: string | null; profile_id: string }[] | null;
}

function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Called from the session-reminders cron (every 10 min, same cadence as
// its other windows) with a window matching join-button.tsx's own
// EARLY_JOIN_MINUTES=10 — sessions/lessons crossing into "starts in
// 5-15 minutes" right now. Returns how many messages actually sent
// (post-dedup), for the route's own response/observability.
export async function sendMeetLinkChatReminders(
  admin: Admin,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const [{ data: sessions }, { data: groupLessons }] = await Promise.all([
    admin
      .from("sessions")
      .select("student_id, actual_coach_id, coaches:actual_coach_id(meet_link, profile_id)")
      .eq("status", "scheduled")
      .gte("scheduled_at", windowStart.toISOString())
      .lt("scheduled_at", windowEnd.toISOString()) as unknown as Promise<{ data: SessionForMeetLink[] | null }>,
    admin
      .from("group_lessons")
      .select(
        "id, coach_id, coaches(meet_link, profile_id), group_lesson_registrations(student_id, status)",
      )
      .is("cancelled_at", null)
      .gte("scheduled_at", windowStart.toISOString())
      .lt("scheduled_at", windowEnd.toISOString()),
  ]);

  let sent = 0;

  for (const s of sessions ?? []) {
    const coach = unwrap(s.coaches);
    if (!coach?.meet_link) continue;
    if (await sendMeetLinkMessage(admin, s.student_id, s.actual_coach_id, coach.profile_id, coach.meet_link)) sent++;
  }

  for (const lesson of groupLessons ?? []) {
    const coach = unwrap(
      lesson.coaches as { meet_link: string | null; profile_id: string } | { meet_link: string | null; profile_id: string }[] | null,
    );
    if (!coach?.meet_link) continue;
    const attendees = (lesson.group_lesson_registrations ?? []) as { student_id: string; status: string }[];
    for (const reg of attendees) {
      if (reg.status !== "registered") continue; // already marked attended/no-show elsewhere — not who's about to join
      if (await sendMeetLinkMessage(admin, reg.student_id, lesson.coach_id, coach.profile_id, coach.meet_link)) sent++;
    }
  }

  return sent;
}
