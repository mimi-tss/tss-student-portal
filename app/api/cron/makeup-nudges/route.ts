import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUnscheduledMakeupCredits } from "@/lib/makeup-credits/unscheduled";
import { notifyStudent } from "@/lib/notifications/create";

// Daily nudge for a makeup credit sitting unused and unbooked — any type,
// any expiry (unlike the existing expiry-gated credit_expiring attention
// item / manual nudge button, which stays untouched and still handles the
// urgent case close to expiry). Fires once per credit (notification_log
// dedup on the credit id), not repeated daily. Scheduled via GitHub
// Actions (.github/workflows/makeup-nudges.yml), same CRON_SECRET pattern
// as every other cron route here.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: students } = await admin
    .from("students")
    .select("id, notify_alerts_email, notify_alerts_sms, notify_alerts_inapp");
  const prefsById = new Map((students ?? []).map((s) => [s.id as string, s]));

  const credits = await getUnscheduledMakeupCredits(admin);

  let notified = 0;
  for (const credit of credits) {
    const prefs = prefsById.get(credit.studentId);
    if (!prefs) continue;

    await notifyStudent(admin, {
      studentId: credit.studentId,
      email: credit.studentEmail,
      phone: credit.studentPhone,
      group: "alerts",
      kind: "makeup_credit_needs_scheduling",
      dedupKey: `student:${credit.studentId}:makeup_nudge:${credit.id}`,
      title: "You have a makeup session to book",
      body: "You have an unused makeup credit — log in to the portal to book it.",
      linkUrl: "/student/book",
      ghlData: { studentName: credit.studentName, creditType: credit.type },
      channels: {
        email: prefs.notify_alerts_email,
        sms: prefs.notify_alerts_sms,
        inApp: prefs.notify_alerts_inapp,
      },
    });
    notified++;
  }

  return NextResponse.json({ checked: credits.length, notified });
}
