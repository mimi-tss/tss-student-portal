import crypto from "node:crypto";

// Confirmed against Kajabi's public docs (help.kajabi.com/api-reference) as
// of building this: base URL, OAuth2 client_credentials flow, and the
// x-kajabi-signature webhook header. NOT confirmed: exact contacts-endpoint
// path/shape for updateKajabiContactField below — verify against the
// OpenAPI spec (openapi.yaml in Kajabi/public_api_docs) once credentials
// exist.
const KAJABI_API_BASE = "https://api.kajabi.com/v1";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// OAuth2 client_credentials grant — Kajabi's public API is not a simple
// static bearer key. Tokens are cached in-memory for the life of the
// serverless function instance and refreshed a minute before expiry.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(`${KAJABI_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.KAJABI_CLIENT_ID,
      client_secret: process.env.KAJABI_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Kajabi OAuth token request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

async function kajabiHeaders() {
  return {
    Authorization: `Bearer ${await getAccessToken()}`,
    "Content-Type": "application/json",
  };
}

// Optional: writes a value onto a Kajabi contact's custom field. Not used
// for login-link delivery (Kajabi Pages don't support per-member merge —
// see lib/auth/magic-link.ts), but kept for cases where the studio wants a
// value available to their own Kajabi email campaigns/automations.
export async function updateKajabiContactField(
  contactId: string,
  fieldKey: string,
  value: string,
) {
  const res = await fetch(`${KAJABI_API_BASE}/contacts/${contactId}`, {
    method: "PATCH",
    headers: await kajabiHeaders(),
    body: JSON.stringify({ custom_fields: { [fieldKey]: value } }),
  });

  if (!res.ok) {
    throw new Error(
      `Kajabi contact update failed (${res.status}): ${await res.text()}`,
    );
  }

  return res.json();
}

// TODO: confirm the actual endpoint/pagination for listing subscriptions —
// used by the polling reconciliation job (app/api/cron/kajabi-sync) since
// Kajabi has no cancelled/payment-failed webhook events to listen for.
export async function listKajabiSubscriptions(params: { updatedSince?: string } = {}) {
  const url = new URL(`${KAJABI_API_BASE}/subscriptions`);
  if (params.updatedSince) url.searchParams.set("updated_since", params.updatedSince);

  const res = await fetch(url, { headers: await kajabiHeaders() });
  if (!res.ok) {
    throw new Error(`Kajabi subscriptions list failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// Verifies the HMAC-SHA256 signature Kajabi attaches to webhook requests
// via the x-kajabi-signature header, so we only ever act on events that
// actually came from Kajabi. Must be checked against the raw request body,
// before JSON parsing — parsing and re-serializing changes byte content.
export function verifyKajabiSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", process.env.KAJABI_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
