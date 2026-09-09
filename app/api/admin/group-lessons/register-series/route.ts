import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCoach } from "@/lib/notifications/create";
import { registerStudentInRecurringSeries, unregisterStudentFromRecurringSeries } from "@/lib/group-lessons";

function unwrapJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Registers a student into every future, non-cancelled occurrence of a
// recurring group-lesson series in one action — the bulk counterpart to
// /api/admin/group-lessons/register (which stays for a single-occurrence
// drop-in). Same admin-confirms-payment-manually posture, no live Stripe
// integration.
export async function POST(req: NextRequest) {
  const { seriesId, studentId, stripeReference } = await req.json();

  if (!seriesId || !studentId) {
    return NextResponse.json({ error: "seriesId and studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const result = await registerStudentInRecurringSeries(supabase, {
      seriesId,
      studentId,
      stripeReference,
    });

    // One Slack ping for the whole series, not one per occurrence — a
    // coach getting 4+ identical pings for a single bulk registration
    // action would be noise, not signal.
    if (result.registered > 0) {
      const [{ data: series }, { data: student }] = await Promise.all([
        supabase
          .from("recurring_group_lessons")
          .select("topic, coach_id, coaches(name, slack_webhook_url)")
          .eq("id", seriesId)
          .maybeSingle(),
        supabase.from("students").select("name").eq("id", studentId).maybeSingle(),
      ]);

      if (series && student) {
        const coach = unwrapJoin(
          series.coaches as unknown as { name: string; slack_webhook_url: string | null } | { name: string; slack_webhook_url: string | null }[] | null,
        );
        const topicLabel = series.topic?.trim() || "your group class series";
        // notification_log has no insert policy for a regular session —
        // only ever written by the service-role client — so this
        // deliberately uses the admin client, not the RLS-scoped
        // `supabase` used for the lookups above.
        notifyCoach(createAdminClient(), {
          coachId: series.coach_id,
          coachSlackWebhookUrl: coach?.slack_webhook_url ?? null,
          kind: "group_lesson_signup",
          dedupKey: `coach:${series.coach_id}:group_lesson_series_signup:${seriesId}:${studentId}`,
          text: `${student.name} registered for the whole ${topicLabel} series (${result.registered} class${result.registered === 1 ? "" : "es"})`,
        }).catch((err) => console.error(`group lesson series signup notification failed for series ${seriesId}`, err));
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't register student" },
      { status: 500 },
    );
  }
}

// Removes a student from every future, non-cancelled occurrence of the
// series in one action — the bulk counterpart to
// /api/admin/group-lessons/register's DELETE (single occurrence).
export async function DELETE(req: NextRequest) {
  const { seriesId, studentId } = await req.json();

  if (!seriesId || !studentId) {
    return NextResponse.json({ error: "seriesId and studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const result = await unregisterStudentFromRecurringSeries(supabase, { seriesId, studentId });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't remove that student" },
      { status: 500 },
    );
  }
}
