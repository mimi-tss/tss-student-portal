import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminProfileId } from "@/lib/auth/require-admin-api";
import { coachFirstNameFromTopic, notifyStudentCreditsAdded } from "@/lib/billing/fulfill-addon";

// One "credits added — book now" notification after an admin adds credits
// by hand (the add-credit forms save line by line, then call this ONCE if
// "Notify student" is ticked — so a multi-line add is one email, not one
// per line).
export async function POST(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "admins only" }, { status: 403 });
  const { studentId, lessons, group } = (await req.json()) as {
    studentId?: string;
    lessons?: { durationMinutes: number; expiresAt: string | null; quantity: number }[];
    group?: { topic: string; expiresAt: string | null; quantity: number }[];
  };
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  const lessonLines = (lessons ?? []).flatMap((l) =>
    Array.from({ length: Math.max(0, Math.min(10, l.quantity)) }, () => ({ durationMinutes: l.durationMinutes, expiresAt: l.expiresAt })),
  );
  const groupCount = (group ?? []).reduce((n, g) => n + Math.max(0, Math.min(10, g.quantity)), 0);
  const firstGroup = group?.[0];
  const soonest = (group ?? []).map((g) => g.expiresAt).filter((d): d is string => !!d).sort()[0] ?? null;

  await notifyStudentCreditsAdded(createAdminClient(), studentId, {
    purchased: false,
    lessons: lessonLines,
    group: groupCount
      ? { count: groupCount, label: "Group Coaching Session", coachFirstName: coachFirstNameFromTopic(firstGroup?.topic ?? ""), expiresAt: soonest }
      : null,
    reference: `admin:${Date.now()}`,
  });
  return NextResponse.json({ ok: true });
}
