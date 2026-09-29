import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminProfileId } from "@/lib/support/admin";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024;

// Screenshot upload for help articles -> public help-images bucket
// (0113). Returns the public URL; the editor inserts it as Markdown.
export async function POST(req: NextRequest) {
  if (!(await requireAdminProfileId())) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  const ext = EXTENSIONS[file.type];
  if (!ext) return NextResponse.json({ error: "Use a PNG, JPG, WebP or GIF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is over 5 MB." }, { status: 400 });

  const admin = createAdminClient();
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("help-images")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = admin.storage.from("help-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
