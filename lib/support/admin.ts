import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";
import { splitSuggestions } from "@/lib/support/suggestions";
import { isMinorBirthDate, loadMessages, signAttachmentUrls, type SupportThread } from "@/lib/support/thread";

// Admin API routes check the role explicitly (they use the service-role
// client for writes, so RLS alone doesn't gate them).
export async function requireAdminProfileId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return isAdminRole(profile?.role) ? user.id : null;
}

export interface AdminThreadRow {
  id: string;
  status: SupportThread["status"];
  who: string;
  email: string | null;
  tier: string | null;
  isMinor: boolean;
  studentId: string | null;
  reason: string | null;
  summary: string | null;
  escalatedAt: string | null;
  updatedAt: string;
  createdAt: string;
  claimedByName: string | null;
  lastMessage: string | null;
  costUsd: number;
}

// Rough per-thread spend at Sonnet 5 / 5.5 list prices (input $2, output $10,
// cache reads $0.20 per 1M) — shown in the inbox so the studio can see
// what the bot actually costs. Approximate by design.
export function estimateCostUsd(t: Pick<SupportThread, "input_tokens" | "output_tokens" | "cache_read_tokens">) {
  return (t.input_tokens * 2 + t.output_tokens * 10 + t.cache_read_tokens * 0.2) / 1_000_000;
}

type ThreadWithJoins = SupportThread & {
  updated_at: string;
  students: { name: string; email: string; tier: string; birth_date: string | null } | { name: string; email: string; tier: string; birth_date: string | null }[] | null;
  coaches: { name: string; email: string } | { name: string; email: string }[] | null;
};

export async function listAdminThreads(admin: SupabaseClient, limit = 200): Promise<AdminThreadRow[]> {
  const { data } = await admin
    .from("support_threads")
    .select("*, students(name, email, tier, birth_date), coaches(name, email)")
    .order("updated_at", { ascending: false })
    .limit(limit);
  const threads = (data ?? []) as ThreadWithJoins[];

  const claimers = [...new Set(threads.map((t) => t.claimed_by).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  // profiles has no name/email — admins are auth users only.
  await Promise.all(
    claimers.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      names.set(id, data.user?.email?.split("@")[0] ?? "Admin");
    }),
  );

  const ids = threads.map((t) => t.id);
  const last = new Map<string, string>();
  if (ids.length) {
    const { data: msgs } = await admin
      .from("support_messages")
      .select("thread_id, body, created_at")
      .in("thread_id", ids)
      .not("body", "is", null)
      .order("created_at", { ascending: false })
      .limit(ids.length * 4);
    for (const m of msgs ?? []) if (!last.has(m.thread_id)) last.set(m.thread_id, splitSuggestions(m.body as string).text ?? "");
  }

  return threads.map((t) => {
    const s = Array.isArray(t.students) ? t.students[0] : t.students;
    const c = Array.isArray(t.coaches) ? t.coaches[0] : t.coaches;
    return {
      id: t.id,
      status: t.status,
      who: s?.name ?? c?.name ?? t.guest_name ?? t.guest_email ?? "Guest (not logged in)",
      email: s?.email ?? c?.email ?? t.guest_email,
      // Coach chats show a "Coach" tag where a student's plan would be.
      tier: s?.tier ?? (c ? "Coach" : null),
      isMinor: isMinorBirthDate(s?.birth_date),
      studentId: t.student_id,
      reason: t.escalation_reason,
      summary: t.escalation_summary,
      escalatedAt: t.escalated_at,
      updatedAt: t.updated_at,
      createdAt: t.created_at,
      claimedByName: t.claimed_by ? (names.get(t.claimed_by) ?? "Admin") : null,
      lastMessage: last.get(t.id) ?? null,
      costUsd: estimateCostUsd(t),
    };
  });
}

export async function loadAdminThread(admin: SupabaseClient, threadId: string) {
  const [rows, messages] = await Promise.all([
    admin.from("support_threads").select("*, students(name, email, tier, birth_date), coaches(name, email)").eq("id", threadId).maybeSingle(),
    loadMessages(admin, threadId),
  ]);
  const t = rows.data as ThreadWithJoins | null;
  if (!t) return null;
  const s = Array.isArray(t.students) ? t.students[0] : t.students;
    const c = Array.isArray(t.coaches) ? t.coaches[0] : t.coaches;
  const signed = await signAttachmentUrls(
    admin,
    messages.map((m) => m.attachment_path).filter((p): p is string => !!p),
  );
  return {
    thread: {
      id: t.id,
      status: t.status,
      who: s?.name ?? c?.name ?? t.guest_name ?? t.guest_email ?? "Guest (not logged in)",
      email: s?.email ?? c?.email ?? t.guest_email,
      // Coach chats show a "Coach" tag where a student's plan would be.
      tier: s?.tier ?? (c ? "Coach" : null),
      isMinor: isMinorBirthDate(s?.birth_date),
      studentId: t.student_id,
      reason: t.escalation_reason,
      summary: t.escalation_summary,
      escalatedAt: t.escalated_at,
      createdAt: t.created_at,
      costUsd: estimateCostUsd(t),
      botTurns: t.bot_turns,
    },
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: splitSuggestions(m.body).text,
      attachmentUrl: m.attachment_path ? (signed[m.attachment_path] ?? null) : null,
      action: m.action,
      createdAt: m.created_at,
    })),
  };
}

export type AdminThreadDetail = NonNullable<Awaited<ReturnType<typeof loadAdminThread>>>;
