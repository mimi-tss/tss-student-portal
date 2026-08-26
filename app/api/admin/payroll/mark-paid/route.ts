import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// Toggles a finalized payroll_entries row's paid flag — real disbursement
// still happens externally (Gusto/Deel/QuickBooks), this just records
// that it happened (TSS_App_Spec_1.md section 8).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { entryId, paid } = await req.json();

  if (!entryId || typeof paid !== "boolean") {
    return NextResponse.json({ error: "entryId and paid (boolean) required" }, { status: 400 });
  }

  const { error } = await supabase.from("payroll_entries").update({ paid }).eq("id", entryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
