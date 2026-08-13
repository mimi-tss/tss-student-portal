import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

// Long-lived but single-use: the token sits unused until the student opens
// the email, so it needs a generous ceiling — security comes from
// single-use + rotation-on-use, not a short TTL.
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Mints a token and stores only its hash — never the raw value — so a
// database leak alone doesn't hand out live login links.
export async function mintMagicLinkToken(studentId: string) {
  const raw = crypto.randomBytes(32).toString("base64url");
  const admin = createAdminClient();

  const { error } = await admin.from("magic_link_tokens").insert({
    student_id: studentId,
    token_hash: hashToken(raw),
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });

  if (error) throw error;
  return raw;
}

// Validates and burns a token in one step. Returns the student_id it was
// issued for, or null if the token is missing/expired/already used.
export async function consumeMagicLinkToken(raw: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("magic_link_tokens")
    .select("id, student_id, expires_at, used_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();

  if (error || !data) return null;
  if (data.used_at) return null; // already used — treat as invalid, not an error
  if (new Date(data.expires_at) < new Date()) return null;

  await admin
    .from("magic_link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data.student_id as string;
}

// Mints a fresh token and emails it directly to the student. Kajabi Pages
// can't merge a per-member value into a link (only emails support Liquid
// custom-field merge, and only inside Kajabi's own campaign builder), so
// this app sends the login email itself rather than relying on Kajabi to
// surface it. Still triggered synchronously off the qualifying webhook, so
// it's already sent by the time the student checks their inbox — no
// on-demand minting delay. Call again right after a token is consumed, so
// the next login is just as instant.
export async function issueAndSendLoginLink(studentId: string, email: string) {
  const token = await mintMagicLinkToken(studentId);
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/kajabi/login?token=${token}`;

  await sendEmail(
    email,
    "Your Tara Simon Studios portal link",
    `<p>Tap below to open your coaching portal — no password needed:</p>
     <p><a href="${url}">Open my portal</a></p>`,
  );

  return url;
}
