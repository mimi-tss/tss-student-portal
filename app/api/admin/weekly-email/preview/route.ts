import { NextRequest, NextResponse } from "next/server";
import { requireAdminProfileId } from "@/lib/support/admin";
import { weeklyDigest } from "@/lib/email/templates/weekly-digest";
import type { DigestEvent, DigestFeature } from "@/lib/digest/content";

// Renders the admin's unsaved draft into the real digest template, with a
// made-up student's week around it, so the Weekly Email page can show
// exactly what the boxes will look like. Nothing is saved or sent.
export async function POST(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "admins only" }, { status: 403 });
  const { features, upcoming } = (await req.json()) as { features: DigestFeature[]; upcoming: DigestEvent[] };

  const { html, subject } = weeklyDigest({
    firstName: "Sara",
    streakDays: 3,
    thisWeek: [{ when: "Tue, Sep 29 · 4:00 PM ET", label: "Private Coaching Session with Coach Nikki" }],
    attendedLastWeek: 1,
    newRecordingsLastWeek: 1,
    homework: null,
    exercisesAssigned: 4,
    credits: [],
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
