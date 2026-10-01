import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinanceRole } from "@/lib/auth/roles";

// Toggles a finalized payroll_entries row's paid flag — real disbursement
// still happens externally (Gusto/Deel/QuickBooks), this just records
// that it happened (TSS_App_Spec_1.md section 8). Takes one entryId, or
// entryIds to mark a whole run at once (Finance "Mark run paid"), with
// an optional paidOn date ("2026-10-05", migration 0123) — the day the
// direct deposit lands. Un-marking clears it.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  if (!(await hasFinanceRole(supabase))) {
    return NextResponse.json({ error: "finance access only" }, { status: 403 });
  }

  const { entryId, entryIds, paid, paidOn } = await req.json();
  const ids: string[] = Array.isArray(entryIds) ? entryIds.filter((id) => typeof id === "string") : entryId ? [entryId] : [];

  if (ids.length === 0 || typeof paid !== "boolean") {
    return NextResponse.json({ error: "entryId (or entryIds) and paid (boolean) required" }, { status: 400 });
  }

  if (paidOn !== undefined && paidOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return NextResponse.json({ error: "paidOn must be a date like 2026-10-05" }, { status: 400 });
  }

  const { error } = await supabase
    .from("payroll_entries")
    .update({ paid, paid_on: paid ? (paidOn ?? new Date().toISOString().slice(0, 10)) : null })
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
