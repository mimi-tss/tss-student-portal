import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAdminThreads, loadAdminThread, requireAdminProfileId } from "@/lib/support/admin";
import { addMessage, etaMinutesLeft, isMinorBirthDate, type SupportThread } from "@/lib/support/thread";
import { emailTranscript } from "@/lib/support/escalate";

export const dynamic = "force-dynamic";

// GET: inbox list, or one thread with ?id= (both polled by the admin
// support pages). POST: an admin action on a thread.
export async function GET(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const admin = createAdminClient();
  // The admin-portal pop-up (app/(admin)/support-alert.tsx): chats waiting
  // for a person, oldest first. Small payload — polled every few seconds.
  if (req.nextUrl.searchParams.get("pending")) {
    const { data } = await admin
      .from("support_threads")
      .select("id, escalated_at, escalation_reason, escalation_summary, eta_minutes, eta_set_at, guest_name, guest_email, students(name, birth_date)")
      .eq("status", "needs_human")
      .order("escalated_at", { ascending: true })
      .limit(20);
    return NextResponse.json({
      pending: (data ?? []).map((t) => {
        const s = (Array.isArray(t.students) ? t.students[0] : t.students) as { name: string; birth_date: string | null } | null;
        return {
          id: t.id,
          who: s?.name ?? t.guest_name ?? t.guest_email ?? "Guest",
          isMinor: isMinorBirthDate(s?.birth_date),
          reason: t.escalation_reason,
          summary: t.escalation_summary,
          escalatedAt: t.escalated_at,
          etaMinutesLeft: etaMinutesLeft(t),
        };
      }),
    });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const detail = await loadAdminThread(admin, id);
    return detail ? NextResponse.json(detail) : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ threads: await listAdminThreads(admin) });
}

type Action = "claim" | "reply" | "resolve" | "handback" | "email" | "reopen" | "eta";

export async function POST(req: NextRequest) {
  const profileId = await requireAdminProfileId();
  if (!profileId) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { threadId, action, body, minutes } = (await req.json().catch(() => ({}))) as {
    threadId?: string;
    action?: Action;
    body?: string;
    minutes?: number;
  };
  const admin = createAdminClient();
  const { data } = await admin.from("support_threads").select("*").eq("id", threadId ?? "").maybeSingle();
  const thread = data as SupportThread | null;
  if (!thread) return NextResponse.json({ error: "Thread not found." }, { status: 404 });

  const now = new Date().toISOString();

  switch (action) {
    case "claim":
      await admin.from("support_threads").update({ status: "claimed", claimed_by: profileId, claimed_at: now }).eq("id", thread.id);
      await addMessage(admin, { threadId: thread.id, sender: "system", body: "A studio team member has joined the chat." });
      break;

    case "reply": {
      const text = (body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Type a reply first." }, { status: 400 });
      // Replying takes the thread over from the bot/queue automatically.
      if (thread.status !== "claimed") {
        await admin.from("support_threads").update({ status: "claimed", claimed_by: profileId, claimed_at: now }).eq("id", thread.id);
      }
      await addMessage(admin, { threadId: thread.id, sender: "admin", senderProfileId: profileId, body: text });
      break;
    }

    // "I'll be there in N minutes" — the student's banner switches to this
    // promise, and the ping stops nagging other admins.
    case "eta": {
      const m = Math.round(Number(minutes));
      if (!Number.isFinite(m) || m < 1 || m > 240) return NextResponse.json({ error: "Pick 1–240 minutes." }, { status: 400 });
      if (thread.status !== "needs_human") return NextResponse.json({ error: "This chat isn't waiting any more." }, { status: 409 });
      await admin.from("support_threads").update({ eta_minutes: m, eta_set_at: now }).eq("id", thread.id);
      await addMessage(admin, {
        threadId: thread.id,
        sender: "system",
        body: `A team member has seen your message and will join in about ${m} ${m === 1 ? "minute" : "minutes"}.`,
      });
      break;
    }

    case "resolve":
      await admin.from("support_threads").update({ status: "resolved", resolved_at: now }).eq("id", thread.id);
      await addMessage(admin, {
        threadId: thread.id,
        sender: "system",
        body: "This chat was marked as resolved. Send a new message any time if you need more help.",
      });
      break;

    case "handback":
      await admin.from("support_threads").update({ status: "bot", claimed_by: null, claimed_at: null }).eq("id", thread.id);
      await addMessage(admin, { threadId: thread.id, sender: "system", body: "The help assistant is back — ask it anything else." });
      break;

    case "reopen":
      await admin.from("support_threads").update({ status: "claimed", claimed_by: profileId, claimed_at: now }).eq("id", thread.id);
      break;

    case "email":
      try {
        await emailTranscript(admin, thread, "admin");
      } catch (err) {
        console.error("admin support transcript email failed", err);
        return NextResponse.json({ error: "Couldn't send the email." }, { status: 502 });
      }
      break;

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json(await loadAdminThread(admin, thread.id));
}
