import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole } from "@/lib/auth/roles";
import { unmatchRecording } from "@/lib/admin/recording-matching";

// Undoes a wrong match — see unmatchRecording's own comment for why
// this exists (Meet occasionally splits one lesson into two
// identically-named files; whichever synced first sometimes isn't the
// real one). Puts the recording straight back into the unmatched queue
// so it (and the correct file, if there is one) can be matched again.
export async function POST(req: NextRequest) {
  const { recordingId } = await req.json();
  if (!recordingId) return NextResponse.json({ error: "recordingId is required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAdminRole(profile?.role)) return NextResponse.json({ error: "admin access only" }, { status: 403 });

  const result = await unmatchRecording(createAdminClient(), recordingId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
