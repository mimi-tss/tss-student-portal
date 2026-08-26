import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findUnrecordedAttendance } from "@/lib/payroll/calculate";
import { notifySlack } from "@/lib/slack/notify";
import { hasFinanceRole } from "@/lib/auth/roles";

// Admin-triggered nudge for the monthly payroll check: post one Slack
// message listing every coach with unmarked sessions in the range, so
// they can go mark attendance before the run happens. Recomputes rather
// than trusting a client-supplied list, so the message always reflects
// the current state.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { periodStart, periodEnd, coachId } = await req.json();

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "periodStart and periodEnd required" }, { status: 400 });
  }

  const coaches = await findUnrecordedAttendance(supabase, periodStart, periodEnd, coachId || undefined);

  const sessionCount = coaches.reduce((sum, c) => sum + c.sessions.length, 0);
  if (sessionCount === 0) {
    return NextResponse.json({ notified: false, coachCount: 0, sessionCount: 0 });
  }

  const rangeLabel = `${new Date(periodStart).toLocaleDateString()} – ${new Date(periodEnd).toLocaleDateString()}`;
  const lines = coaches.map((c) => `• *${c.coachName}* — ${c.sessions.length} session${c.sessions.length === 1 ? "" : "s"}`);
  await notifySlack(
    `📋 *Payroll attendance check — ${rangeLabel}*\nThe following sessions still need attendance marked before payroll runs:\n${lines.join("\n")}`,
  );

  return NextResponse.json({ notified: true, coachCount: coaches.length, sessionCount });
}
