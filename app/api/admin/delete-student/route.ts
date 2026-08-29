import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Permanent, irreversible deletion — as opposed to archive-student's
// reversible hide. Available for any student regardless of history (the
// confirmation warning lives client-side, not a server-side restriction)
// per explicit instruction — this is not restricted to students with no
// real activity. The actual cascade lives in the database as a single
// transaction (migration 0068's delete_student_permanently) rather than
// sequential deletes here, so a failure partway through can't leave the
// student half-deleted. RPC runs on the session-scoped client (not the
// admin client) so is_admin() inside the function evaluates against the
// real caller — same defense-in-depth posture as every RLS policy in
// this schema already takes.
export async function POST(req: NextRequest) {
  const { studentId } = await req.json();

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: profileId, error } = await supabase.rpc("delete_student_permanently", {
    p_student_id: studentId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Removes the actual Supabase auth user/login — needs the service-role
  // client, which the database function has no access to. The student's
  // data is already fully gone at this point regardless of whether this
  // step succeeds, so a failure here is logged, not surfaced as an
  // overall failure (the admin's intent — "delete this student" — is
  // already accomplished; a lingering auth user with no profile/student
  // row left is a cleanup detail, not data loss).
  if (profileId) {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(profileId);
    if (authError) {
      console.error(`Failed to delete auth user ${profileId} after deleting student ${studentId}`, authError);
    }
  }

  return NextResponse.json({ success: true });
}
