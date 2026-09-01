import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { windowEndMinutes } from "@/lib/scheduling/working-hours";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Admin edits a coach's weekly availability — coaches.working_hours is a
// jsonb map of day-key -> array of ["HH:MM","HH:MM"] windows (see
// components/coach-calendar.tsx, which already reads this same shape).
// RLS ("admins can update coaches", migration 0041 — coaches previously
// had no UPDATE policy at all) enforces the admin-only check server-side.
//
// effectiveDate ("YYYY-MM-DD", optional) is when this version of the
// hours should start applying (migration 0044). Today-or-earlier (or
// omitted) writes straight to working_hours, same as before — immediate,
// and clears any previously-queued pending change since an immediate
// save supersedes it. A future date instead writes to
// pending_working_hours/pending_effective_date, leaving working_hours
// (the currently-live schedule) untouched — every reader that walks a
// date range resolves per-day via lib/scheduling/working-hours.ts, so
// near-term dates keep showing the old hours until that date arrives.
export async function POST(req: NextRequest) {
  const { coachId, workingHours, effectiveDate } = await req.json();

  if (!coachId || !workingHours || typeof workingHours !== "object") {
    return NextResponse.json({ error: "coachId and workingHours required" }, { status: 400 });
  }

  for (const [day, windows] of Object.entries(workingHours)) {
    if (!DAY_KEYS.includes(day)) {
      return NextResponse.json({ error: `invalid day key: ${day}` }, { status: 400 });
    }
    if (!Array.isArray(windows)) {
      return NextResponse.json({ error: `${day} must be an array of [start,end] windows` }, { status: 400 });
    }
    for (const w of windows) {
      if (!Array.isArray(w) || w.length !== 2 || typeof w[0] !== "string" || typeof w[1] !== "string") {
        return NextResponse.json({ error: `${day} has a malformed window` }, { status: 400 });
      }
      // "00:00" as an end time means end-of-day (24:00), not literal
      // midnight-at-the-start — a window like ["20:30","00:00"] (e.g. an
      // 8:30pm-midnight session) is real and valid, but plain string
      // comparison reads "00:00" as earlier than any start time.
      const [startH, startM] = w[0].split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      if (windowEndMinutes(w[1]) <= startMinutes) {
        return NextResponse.json({ error: `${day}: end time must be after start time` }, { status: 400 });
      }
    }
  }

  const isFuture = typeof effectiveDate === "string" && effectiveDate > todayKey();

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("coaches")
    .update(
      isFuture
        ? { pending_working_hours: workingHours, pending_effective_date: effectiveDate }
        : { working_hours: workingHours, pending_working_hours: null, pending_effective_date: null },
    )
    .eq("id", coachId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // RLS blocking an UPDATE doesn't error — it just matches zero rows, so
  // this would otherwise report success while writing nothing (bit this
  // project before: see migration 0041's own comment). `.select("id")`
  // above is what makes the affected row actually visible here.
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "No coach row was updated — check that migration 0041_admin_coach_updates.sql has been applied." },
      { status: 403 },
    );
  }

  return NextResponse.json({ success: true, pending: isFuture });
}
