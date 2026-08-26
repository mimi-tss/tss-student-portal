import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// Deletes a manual adjustment entered by mistake. Scoped to
// is_manual = true only — a session/group-lesson-derived entry is never
// deletable here (those track real attendance records; removing a bad
// one is a session-status fix, not a payroll action).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { entryId } = await req.json();
  if (!entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }

  const { error } = await supabase.from("payroll_entries").delete().eq("id", entryId).eq("is_manual", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
