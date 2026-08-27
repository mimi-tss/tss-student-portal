import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { isAdminRole } from "@/lib/auth/roles";

// Coaches have no Kajabi counterpart at all — Kajabi only ever fires for
// student purchases (see app/api/webhooks/kajabi/route.ts), so a coach is
// pure internal staff, always admin-provisioned. This is the coach
// equivalent of app/api/admin/provision-student/route.ts's manual path:
// same createUser + profiles-row pattern, just for role "coach" instead of
// "student", plus a coaches row instead of a students row.
export async function POST(req: NextRequest) {
  const { name, email, timezone, hourlyRate, meetLink, hiddenFromStudents, workingHours } = await req.json();

  if (!name || !email || !timezone || hourlyRate == null) {
    return NextResponse.json(
      { error: "name, email, timezone, and hourlyRate required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: coach, error } = await admin
    .from("coaches")
    .insert({
      name,
      email,
      timezone,
      hourly_rate: hourlyRate,
      working_hours: workingHours ?? {},
      meet_link: meetLink || null,
      hidden_from_students: !!hiddenFromStudents,
    })
    .select("id")
    .single();

  if (error || !coach) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (!createErr && authUser.user) {
    await admin.from("profiles").insert({ id: authUser.user.id, role: "coach" });
    await admin.from("coaches").update({ profile_id: authUser.user.id }).eq("id", coach.id);
  }

  // Same generateLink + email-it-ourselves pattern as
  // app/api/auth/kajabi/login/route.ts uses for students — Kajabi Pages
  // can't merge a token into a link, but that constraint doesn't apply
  // here; reused only for consistency, not because it's required.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=/coach/dashboard`,
    },
  });

  if (!linkError && linkData) {
    await sendEmail(
      email,
      "Your Tara Simon Studios coach portal link",
      `<p>Tap below to open your coach portal — no password needed:</p>
       <p><a href="${linkData.properties.action_link}">Open my portal</a></p>`,
    ).catch((err) => console.error("Failed to send coach login link", err));
  }

  return NextResponse.json({ success: true });
}
