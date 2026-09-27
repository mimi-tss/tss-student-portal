import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminProfileId } from "@/lib/auth/require-admin-api";
import { weeklyDigest } from "@/lib/email/templates/weekly-digest";
import { buildDigestRecipients, type StudentDigestData } from "@/lib/digest/build";
import { nextDigestWeekKey, weekStartInstant } from "@/lib/digest/week";
import type { DigestEvent, DigestFeature } from "@/lib/digest/content";

// Renders the admin's unsaved boxes/events into the real digest template.
// With a studentId it uses that student's actual week (same builder the
// Monday send uses), so the preview is exactly what they'll get;
// without one, a made-up sample student. Nothing is saved or sent.
const SAMPLE: StudentDigestData = {
  firstName: "Sara",
  streakDays: 3,
  thisWeek: [{ when: "Tue, Sep 29 · 4:00 PM ET", label: "Private Coaching Session with Coach Nikki" }],
  attendedLastWeek: 1,
  newRecordingsLastWeek: 1,
  homework: null,
  exercisesAssigned: 4,
  credits: [],
};

export async function POST(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "admins only" }, { status: 403 });
  const { features, upcoming, studentId } = (await req.json()) as {
    features: DigestFeature[];
    upcoming: DigestEvent[];
    studentId?: string;
  };

  let data = SAMPLE;
  if (studentId) {
    const [r] = await buildDigestRecipients(createAdminClient(), {
      weekStart: weekStartInstant(nextDigestWeekKey()),
      studentIds: [studentId],
    });
    if (!r) return NextResponse.json({ error: "student not found (or not on a digest plan)" }, { status: 404 });
    data = r.data;
  }

  const { html, subject } = weeklyDigest({
    ...data,
    features: (features ?? []).map((f) => ({
      position: f.position,
      heading: f.heading?.trim() || null,
      body: f.body?.trim() || null,
      imageUrl: f.imageUrl?.trim() || null,
      buttonLabel: f.buttonLabel?.trim() || null,
      buttonUrl: f.buttonUrl?.trim() || null,
    })),
    upcoming: upcoming ?? [],
  });
  return NextResponse.json({ html, subject });
}
