import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRecurringSchedule } from "@/lib/admin/create-recurring-schedule";
import { checkWeeklyOption, listWeeklyOptions, loadWeeklySetupState, startDateFor } from "@/lib/scheduling/weekly-setup";
import { notifyStudentWeeklyLessonSet } from "@/lib/notifications/booking-events";
import { DAY_NAMES } from "@/lib/scheduling/recurring";

// Student self-setup of their weekly 1:1 lesson (Pro/Elite, no weekly
// slot yet). GET lists the weekly times open with one coach; POST saves
// the chosen one through the same lib/admin/create-recurring-schedule.ts
// the admin form uses. Students can only READ recurring_schedules (RLS,
// migration 0020), so after confirming who the logged-in student is,
// every read/write here goes through the service-role client — the
// student id always comes from the session, never from the request body.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function currentStudent(): Promise<{ student: any } | { response: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "You're logged out. Please log in again." }, { status: 401 }) };
  }
  const { data: student } = await supabase
    .from("students")
    .select("id, name, tier, assigned_coach_id, session_duration_minutes, subscription_status, payment_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) {
    return { response: NextResponse.json({ error: "We couldn't find your student account." }, { status: 404 }) };
  }
  return { student };
}

// Needs Review item when self-setup hits something an admin should look
// at. 'weekly_setup_issue' only exists once migration 0125 is applied;
// until then the insert is refused by attention_items_kind_check and this
// falls back to the existing schedule_overlap card so nothing is lost.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function flagForAdmin(admin: any, studentId: string, coachId: string | null, summary: string) {
  const row = { student_id: studentId, coach_id: coachId, summary };
  const { error } = await admin.from("attention_items").insert({ kind: "weekly_setup_issue", ...row });
  if (error) {
    const { error: fallbackError } = await admin.from("attention_items").insert({ kind: "schedule_overlap", ...row });
    if (fallbackError) console.error("weekly-lesson: could not create Needs Review item", fallbackError, summary);
  }
}

export async function GET(req: NextRequest) {
  const found = await currentStudent();
  if ("response" in found) return found.response;
  const { student } = found;

  const coachId = req.nextUrl.searchParams.get("coachId");
  if (!coachId) return NextResponse.json({ error: "Pick a coach first." }, { status: 400 });

  const admin = createAdminClient();
  try {
    const state = await loadWeeklySetupState(admin, student);
    if (state.kind === "has_schedule") {
      return NextResponse.json({ error: "Your weekly lesson is already set up." }, { status: 409 });
    }
    if (state.kind === "not_eligible") return NextResponse.json({ error: state.reason }, { status: 403 });
    if (!state.coaches.some((c) => c.id === coachId)) {
      return NextResponse.json({ error: "That coach isn't available to pick." }, { status: 403 });
    }

    const options = await listWeeklyOptions(admin, {
      coachId,
      studentId: student.id,
      durationMinutes: state.durationMinutes,
    });
    return NextResponse.json({ options, durationMinutes: state.durationMinutes });
  } catch (err) {
    console.error("weekly-lesson GET failed", err);
    return NextResponse.json({ error: "We couldn't load times right now. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const found = await currentStudent();
  if ("response" in found) return found.response;
  const { student } = found;

  const body = await req.json().catch(() => null);
  const coachId: unknown = body?.coachId;
  const dayOfWeek: unknown = body?.dayOfWeek;
  const startTime: unknown = body?.startTime;
  if (typeof coachId !== "string" || typeof dayOfWeek !== "number" || typeof startTime !== "string") {
    return NextResponse.json({ error: "Pick a coach and a time first." }, { status: 400 });
  }

  const admin = createAdminClient();
  let state;
  try {
    state = await loadWeeklySetupState(admin, student);
  } catch (err) {
    console.error("weekly-lesson POST state failed", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (state.kind === "has_schedule") {
    return NextResponse.json({ error: "Your weekly lesson is already set up." }, { status: 409 });
  }
  if (state.kind === "not_eligible") return NextResponse.json({ error: state.reason }, { status: 403 });
  if (!state.coaches.some((c) => c.id === coachId)) {
    return NextResponse.json({ error: "That coach isn't available to pick." }, { status: 403 });
  }

  // Re-check right now with the stricter self-setup rules — the list the
  // student picked from may be minutes old.
  const option = await checkWeeklyOption(admin, {
    coachId,
    studentId: student.id,
    durationMinutes: state.durationMinutes,
    dayOfWeek,
    startTime,
  });
  if (!option) {
    return NextResponse.json(
      { error: "Sorry, that time was just taken. Please pick another one.", refresh: true },
      { status: 409 },
    );
  }

  const { data: coach } = await admin.from("coaches").select("name, timezone").eq("id", coachId).maybeSingle();
  const coachTimeZone = coach?.timezone ?? "America/New_York";

  const result = await createRecurringSchedule(admin, {
    studentId: student.id,
    dayOfWeek,
    startTime,
    durationMinutes: state.durationMinutes,
    startDate: startDateFor(option.firstAt, coachTimeZone),
    coachId,
    cadence: "weekly",
    notifyCoach: true,
  });

  if (!result.success) {
    if (result.status === 409) {
      return NextResponse.json(
        { error: "Sorry, that time was just taken. Please pick another one.", refresh: true },
        { status: 409 },
      );
    }
    console.error("weekly-lesson: createRecurringSchedule failed", result);
    await flagForAdmin(
      admin,
      student.id,
      coachId,
      `Weekly lesson self-setup failed (${DAY_NAMES[dayOfWeek]} ${startTime} with ${coach?.name ?? "coach"}): ${result.error}`,
    );
    return NextResponse.json(
      { error: "We couldn't save your weekly lesson. The studio has been told and will follow up." },
      { status: 500 },
    );
  }

  const slotLabel = `${DAY_NAMES[dayOfWeek]}s ${startTime} (${coachTimeZone}) with ${coach?.name ?? "coach"}`;

  // Everything below is follow-up — the slot is saved. Problems go to
  // Needs Review instead of failing the student's request.
  const problems: string[] = [];
  if (result.created === 0) problems.push("no lessons were generated");
  if (result.warning) problems.push(result.warning);

  const { data: after } = await admin
    .from("students")
    .select("drive_folder_id, assigned_coach_id")
    .eq("id", student.id)
    .maybeSingle();
  if (!after?.assigned_coach_id) problems.push("no coach got assigned");
  if (!after?.drive_folder_id) problems.push("their Drive folder wasn't created");

  const emailed = await notifyStudentWeeklyLessonSet(result.scheduleId);
  if (!emailed) problems.push("the confirmation email didn't send");

  if (problems.length > 0) {
    await flagForAdmin(admin, student.id, coachId, `Student set up weekly lesson ${slotLabel}, but ${problems.join("; ")}`);
  }

  // The "Pro/Elite with no weekly schedule" card is answered now.
  await admin
    .from("attention_items")
    .update({
      status: "resolved",
      admin_note: `Student set up their own weekly lesson: ${slotLabel}`,
      updated_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    })
    .eq("student_id", student.id)
    .eq("kind", "no_recurring_schedule")
    .neq("status", "resolved");

  const { data: upcoming } = await admin
    .from("sessions")
    .select("scheduled_at")
    .eq("recurring_schedule_id", result.scheduleId)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true })
    .limit(4);

  return NextResponse.json({
    success: true,
    coachName: coach?.name ?? null,
    firstAt: upcoming?.[0]?.scheduled_at ?? option.firstAt,
    upcoming: (upcoming ?? []).map((s) => s.scheduled_at),
  });
}
