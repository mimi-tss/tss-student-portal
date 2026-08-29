import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin edit of a student's address — grouped into one route since the
// 5 parts (street, city, state, zip, country) are always edited
// together, same "group simple related fields into one route" call as
// set-student-info (name+email). RLS ("admins can update all
// students", 0007) enforces the admin-only check. street/zip are
// never selected by any coach-facing query (lib/coach/dashboard-
// data.ts) — coach only ever sees city/state/country.
export async function POST(req: NextRequest) {
  const { studentId, street, city, state, zip, country } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({
      address_street: street?.trim() || null,
      address_city: city?.trim() || null,
      address_state: state?.trim() || null,
      address_zip: zip?.trim() || null,
      address_country: country?.trim() || null,
    })
    .eq("id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
