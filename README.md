# TSS Student Portal

Coach and student portal for Tara Simon Studios — handles coaching scheduling,
attendance, payroll, chat, and exercises alongside Kajabi (which owns
courses/community/checkout). Full requirements: [TSS_App_Spec_1.md](TSS_App_Spec_1.md).

## Stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript + Tailwind CSS
- [Supabase](https://supabase.com/) — Postgres database, auth, storage, realtime
- [Vercel](https://vercel.com/) — hosting
- Google APIs (`googleapis`) — Calendar + Drive, authenticated as the studio's
  single Workspace admin account

## Project structure

```
app/
  (student)/student/dashboard   student portal pages
  (student)/student/book        booking/reschedule — its own route, same auth session
  (coach)/coach/dashboard       coach portal pages
  (admin)/admin/dashboard       admin portal pages
  api/webhooks/kajabi           receives Kajabi's 3 real events, syncs status, sends login emails
  api/auth/kajabi/login         magic-link entry point the emailed link points to
  api/cron/kajabi-sync          5-min poll for cancellations/DNC (no webhook exists for these)
  api/booking/slots, /book      open-slot computation + self-service booking, makeup-credit aware
  auth/callback                 Supabase PKCE callback, completes the session
  login/                        auth entry point
lib/
  supabase/                     browser, server, and admin (service-role) Supabase clients
  kajabi/                       Kajabi API client (OAuth2) + webhook secret check
  auth/magic-link.ts            mint/consume/rotate magic-link tokens
  email/send.ts                 Resend-based transactional email
  google/                       Calendar/Drive auth helper
supabase/
  migrations/0001_init.sql      core schema (students, coaches, sessions, makeup
                                 credits, entitlements, payroll, chat, ...)
  migrations/0002_kajabi_auth.sql   magic-link tokens + webhook idempotency log
  migrations/0003_student_rls_policies.sql   RLS for the student booking flow
.github/workflows/kajabi-sync.yml   5-min schedule for api/cron/kajabi-sync (see below)
```

### Auth: Kajabi magic-link login

There's no real Kajabi SSO, and Kajabi's webhook coverage turned out to be
narrower than assumed — confirmed against Kajabi's own docs:

- **Only 3 outbound webhook events exist**: `purchase.created`,
  `payment.succeeded`, `cart.purchase`. No event fires on cancellation, pause,
  or payment failure.
- **Kajabi doesn't sign webhooks at all** — no HMAC, no header, nothing to
  verify a delivery came from Kajabi. Worked around by putting a secret
  token in the webhook URL itself (`?secret=...`), checked server-side —
  see `KAJABI_WEBHOOK_SECRET` in `.env.example`.
- **Kajabi Pages can't merge a per-member value into a link** — only static
  "Variants" (pre-built alternate pages per segment). Liquid custom-field
  merge only works inside Kajabi's own emails.

So the flow is: `purchase.created`/`cart.purchase` fires → the app
synchronously mints a signed, single-use token and **emails it directly**
to the student (no dependency on Kajabi rendering anything). Because
minting + sending happens the instant the webhook fires — not queued
through Zapier — the email is already there by the time the student checks
their inbox, no password screen. The token rotates on every use.

Cancellation and DNC, which have no webhook to listen for, run on a
**5-minute polling job** (`api/cron/kajabi-sync`). This was originally a
Vercel Cron job, but Vercel's free Hobby plan only allows daily crons — it
now runs from a GitHub Actions scheduled workflow instead
(`.github/workflows/kajabi-sync.yml`), calling the same endpoint, at no
cost. Requires a `CRON_SECRET` repository secret in GitHub matching the one
in Vercel's env vars. See `TSS_App_Spec_1.md` section 1 for the full writeup.

**Still unconfirmed** (flagged as TODOs in the code): the exact response
shape of Kajabi's contacts-custom-field and subscriptions-list endpoints —
not in the publicly available docs, needs checking against the OpenAPI spec
once Pro-tier credentials exist.

## First-time setup

1. **Install Node.js** (not yet installed on this machine). Easiest path for a
   beginner: download the LTS installer from [nodejs.org](https://nodejs.org/).
   Verify with:
   ```bash
   node -v
   npm -v
   ```
2. **Install dependencies**, from this folder:
   ```bash
   npm install
   ```
3. **Create a Supabase project** at [supabase.com](https://supabase.com/), then
   run `supabase/migrations/0001_init.sql` in its SQL editor.
4. **Copy the env file** and fill in Supabase + Google + Kajabi values:
   ```bash
   cp .env.example .env.local
   ```
5. **Run the dev server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Not yet built

This is a starting scaffold, not a working app. Placeholder pages exist for
each portal; auth gating, the actual scheduling/booking logic, payroll
calculations, Kajabi webhook handling, and Google Calendar/Drive integration
all still need to be implemented against the schema in
`supabase/migrations/0001_init.sql`.
