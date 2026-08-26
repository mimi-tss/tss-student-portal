import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

// Short-lived on purpose — unlike magic_link_tokens' 30-day link TTL
// (meant to sit unused in an inbox), a code is meant to be typed back
// within the same sitting, right after the email arrives.
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashCode(email: string, code: string) {
  // Salted with the email so the same 6-digit code hashes differently
  // per account — a leaked hash for one email can't be replayed against
  // another.
  return crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Mints a code, stores only its (salted) hash, and emails the raw value
// — same "never store the raw secret" posture as
// lib/auth/magic-link.ts's token hashing.
export async function issueAndSendLoginCode(email: string) {
  const normalizedEmail = email.toLowerCase();
  const code = generateCode();
  const admin = createAdminClient();

  const { error } = await admin.from("login_codes").insert({
    email: normalizedEmail,
    code_hash: hashCode(normalizedEmail, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) throw error;

  await sendEmail(
    normalizedEmail,
    "Your Private Coaching Studio verification code",
    `<p>You're entering the Private Coaching Studio. Here's your code — it's good for 10 minutes:</p>
     <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>`,
  );
}

// Validates and burns a code in one step — same single-use pattern as
// consumeMagicLinkToken. Matches on email + code hash together (not
// "most recent code for this email") so an old, already-superseded code
// can't be reused even if it hasn't technically expired yet.
export async function verifyLoginCode(email: string, code: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();
  const admin = createAdminClient();

  const { data } = await admin
    .from("login_codes")
    .select("id, expires_at, used_at")
    .eq("email", normalizedEmail)
    .eq("code_hash", hashCode(normalizedEmail, code))
    .maybeSingle();

  if (!data) return false;
  if (data.used_at) return false;
  if (new Date(data.expires_at) < new Date()) return false;

  await admin.from("login_codes").update({ used_at: new Date().toISOString() }).eq("id", data.id);
  return true;
}
