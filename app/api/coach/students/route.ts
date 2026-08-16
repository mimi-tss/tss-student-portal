import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lists the logged-in coach's assigned students, for the chat thread
// picker — coach dashboard has no other "my students" list yet.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("profile_id", user.id)
    .single();

  if (!coach) return NextResponse.json({ error: "no coach record" }, { status: 404 });

  const { data: students } = await supabase
    .from("students")
    .select("id, name")
    .eq("assigned_coach_id", coach.id)
    .order("name");

  return NextResponse.json({ students: students ?? [] });
}
