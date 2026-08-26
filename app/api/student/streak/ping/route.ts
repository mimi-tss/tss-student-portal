import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Login streak (mockup: "log in tomorrow to keep it going") — decided:
// counts the first real interaction (any button click) on the dashboard
// per calendar day, not a bare page load. Called once per page load, on
// first click, by components/streak-ping.tsx. Students have no general
// self-update policy on their own row (admin-only, 0007) so this uses
// the service-role admin client after resolving the caller's own student
// row from their session — same posture as other privileged-but-scoped
// writes elsewhere (e.g. provision-student).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: student } = await supabase
    .from("students")
    .select("id, streak_count, streak_last_active_date")
    .eq("profile_id", user.id)
    .single();
  if (!student) return NextResponse.json({ error: "no student record" }, { status: 404 });

  const today = toDateKey(new Date());
  if (student.streak_last_active_date === today) {
    return NextResponse.json({ streakCount: student.streak_count });
  }

  const yesterday = toDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const nextCount = student.streak_last_active_date === yesterday ? student.streak_count + 1 : 1;

  const admin = createAdminClient();
  await admin
    .from("students")
    .update({ streak_count: nextCount, streak_last_active_date: today })
    .eq("id", student.id);

  return NextResponse.json({ streakCount: nextCount });
}
