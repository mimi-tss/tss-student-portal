import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lists coaches available for students to pick for the trial-lesson
// coach picker (section 5) — excludes coaches marked hidden_from_students
// (Coach Tara, section 8: admin-only, never a student-facing choice).
// Admin's own coach dropdowns (assign-coach, provision-student) query
// coaches directly and intentionally see everyone, Tara included.
export async function GET() {
  const supabase = await createClient();

  const { data: coaches } = await supabase
    .from("coaches")
    .select("id, name")
    .eq("hidden_from_students", false)
    .order("name");

  return NextResponse.json({ coaches: coaches ?? [] });
}
