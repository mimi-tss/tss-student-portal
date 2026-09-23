import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySlack } from "@/lib/slack/notify";

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const BUCKET = "bug-reports";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

// Backs the "Found a bug? Report" modal (components/bug-report-button.tsx)
// in the student + coach headers. Multipart form: email, message,
// pageUrl, and up to 3 `screenshots` image files. Uses the service-role
// client for the insert + storage upload (bug_reports has no non-admin
// insert policy, and the bucket has no storage policies at all), so the
// caller's own session is verified here first.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const pageUrl = String(form.get("pageUrl") ?? "").slice(0, 1000);
  const files = form.getAll("screenshots").filter((f): f is File => f instanceof File && f.size > 0);

  if (!email || !message) {
    return NextResponse.json({ error: "Email and a description are required." }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: "Description is too long (5000 characters max)." }, { status: 400 });
  }
  if (files.length > MAX_SCREENSHOTS) {
    return NextResponse.json({ error: `Up to ${MAX_SCREENSHOTS} screenshots.` }, { status: 400 });
  }
  for (const file of files) {
    if (!EXTENSIONS[file.type]) {
      return NextResponse.json({ error: `${file.name} isn't a supported image type.` }, { status: 400 });
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: `${file.name} is over 5 MB.` }, { status: 400 });
    }
  }

  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role ?? null;
  const nameTable = role === "coach" ? "coaches" : role === "student" ? "students" : null;
  let reporterName: string | null = null;
  if (nameTable) {
    const { data } = await admin.from(nameTable).select("name").eq("profile_id", user.id).maybeSingle();
    reporterName = data?.name ?? null;
  }

  const reportId = crypto.randomUUID();
  const screenshotPaths: string[] = [];
  for (const [i, file] of files.entries()) {
    const path = `${reportId}/${i + 1}.${EXTENSIONS[file.type]}`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (error) {
      console.error("bug report screenshot upload failed", error);
      return NextResponse.json({ error: "Couldn't upload a screenshot. Please try again." }, { status: 500 });
    }
    screenshotPaths.push(path);
  }

  const { error: insertError } = await admin.from("bug_reports").insert({
    id: reportId,
    reporter_profile_id: user.id,
    reporter_role: role,
    reporter_name: reporterName,
    email,
    message,
    page_url: pageUrl || null,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    screenshot_paths: screenshotPaths,
  });
  if (insertError) {
    console.error("bug report insert failed", insertError);
    return NextResponse.json({ error: "Couldn't send your report. Please try again." }, { status: 500 });
  }

  const who = reporterName ? `${reporterName} (${role})` : email;
  const shots = screenshotPaths.length ? ` · ${screenshotPaths.length} screenshot(s)` : "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // Own channel (SLACK_BUG_REPORTS_WEBHOOK_URL) so bug reports don't
  // share the staff SLACK_WEBHOOK_URL feed; falls back to that if unset.
  await notifySlack(
    `:beetle: New bug report from ${who}${shots}\n>${message.slice(0, 300).replace(/\n/g, "\n>")}\n${appUrl}/admin/bug-reports`,
    process.env.SLACK_BUG_REPORTS_WEBHOOK_URL || undefined,
  );

  return NextResponse.json({ ok: true });
}
