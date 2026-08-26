import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";

// "Nudge" (unbooked trial) / "Notify" (expiring credit) buttons on the
// Overview "Needs Attention" queue — a one-off reminder email, generic
// copy only (no account specifics beyond the student's own name, same
// posture as the chat inactive-recipient notification).
const COPY: Record<string, { subject: string; body: (name: string) => string }> = {
  trial_unbooked: {
    subject: "Your free trial lesson is waiting",
    body: (name) =>
      `<p>Hi ${name},</p><p>You still have a free trial lesson available — log in to the portal to book a time with a coach whenever works for you.</p>`,
  },
  credit_expiring: {
    subject: "A session credit is expiring soon",
    body: (name) =>
      `<p>Hi ${name},</p><p>One of your makeup session credits is expiring soon — log in to the portal to book it before it lapses.</p>`,
  },
};

export async function POST(req: NextRequest) {
  const { studentId, kind } = await req.json();

  if (!studentId || !COPY[kind]) {
    return NextResponse.json({ error: `kind must be one of: ${Object.keys(COPY).join(", ")}` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("name, email").eq("id", studentId).maybeSingle();
  if (!student) return NextResponse.json({ error: "student not found" }, { status: 404 });

  const { subject, body } = COPY[kind];
  await sendEmail(student.email, subject, body(student.name));

  return NextResponse.json({ success: true });
}
