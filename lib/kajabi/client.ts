import crypto from "node:crypto";

// Confirmed against Kajabi's public docs (help.kajabi.com/api-reference) as
// of building this: base URL and the OAuth2 client_credentials flow.
// Confirmed ABSENT: Kajabi webhooks carry no signature or verification
// token of any kind (help.kajabi.com/articles/api-integrations/webhooks/
// webhooks-explained) — there is nothing to check against an
// x-kajabi-signature-style header, because Kajabi never sends one. See
// verifyKajabiWebhookSecret below for the workaround this forced.
// NOT confirmed: exact contacts-endpoint path/shape for
// updateKajabiContactField below — verify against the OpenAPI spec
// (openapi.yaml in Kajabi/public_api_docs) once credentials exist.
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

// Returns the Offer IDs a contact currently holds — confirmed real via
// GET /v1/contacts?filter[email]=... and its relationships.offers.data.
// This is the only reliable way to detect a downgrade/cancellation/the
// 60-min add-on being removed, since Kajabi has no webhook for any of
// those (confirmed) and /v1/subscriptions, this function's previous
// implementation, doesn't exist at all (confirmed 404, not assumed —
// see app/api/cron/kajabi-sync).
export async function getKajabiContactOfferIds(email: string): Promise<string[]> {
  const url = new URL(`${KAJABI_API_BASE}/contacts`);
  url.searchParams.set("filter[email]", email);

  const res = await fetch(url, { headers: await kajabiHeaders() });
  if (!res.ok) {
    throw new Error(`Kajabi contact lookup failed (${res.status}): ${await res.text()}`);
  }

  const body = (await res.json()) as {
    data: { relationships?: { offers?: { data?: { id: string }[] } } }[];
  };

  const offers = body.data[0]?.relationships?.offers?.data ?? [];
  return offers.map((o) => o.id);
}

// Kajabi doesn't sign webhook payloads at all, so there's no header to
// verify against — the standard workaround when a sender doesn't support
// signing: embed a shared secret directly in the webhook URL we give
// Kajabi (?secret=...) and check it here. Not as strong as an HMAC over
// the body, but it does mean the endpoint only acts on requests that know
// this secret, which anyone scanning/guessing the bare URL won't.
export function verifyKajabiWebhookSecret(providedSecret: string | null) {
  if (!providedSecret) return false;

  const expected = Buffer.from(process.env.KAJABI_WEBHOOK_SECRET!);
  const provided = Buffer.from(providedSecret);

  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}
