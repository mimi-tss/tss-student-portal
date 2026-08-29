import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin edit of a student's own name/email — separate from the various
// *_override fields nearby (birth date, coach-start, student-since),
// which exist to correct/backfill a derived stat. This just corrects
// the base row. RLS ("admins can update all students", 0007) enforces
// the admin-only check, same as the sibling set-* routes here. Email
// doubles as the Kajabi webhook's own match key for purchase syncing
// (app/api/webhooks/kajabi/route.ts) — changing it here doesn't touch
// Kajabi's own records, so a mismatch is possible until the studio
// updates it there too; that's on the admin making the call, not
// something this route can prevent.
export async function POST(req: NextRequest) {
  const { studentId, name, email, phone, gender } = await req.json();

  if (!studentId || [name, email, phone, gender].every((v) => v === undefined)) {
    return NextResponse.json({ error: "studentId and at least one field required" }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name can't be empty" }, { status: 400 });
    }
    update.name = trimmed;
  }
  if (email !== undefined) {
    const trimmed = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      return NextResponse.json({ error: "enter a valid email address" }, { status: 400 });
    }
    update.email = trimmed;
  }
  if (phone !== undefined) {
    update.phone = String(phone).trim() || null;
  }
  if (gender !== undefined) {
    update.gender = String(gender).trim() || null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").update(update).eq("id", studentId);

  if (error) {
    const message = error.code === "23505" ? "another student already uses that email" : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
