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
  api/booking/slots, /book      open-slot computation + self-service booking,
                                 makeup-credit and trial-lesson aware
  api/booking/coaches           coach list, for the trial-lesson coach picker
  api/admin/assign-coach        admin sets a student's assigned coach
  api/admin/provision-student   manual student creation for ambassadors
                                 (Grant Offer / 100%-coupon — no webhook fires)
  auth/callback                 client-side page that picks up the fragment-
                                 delivered session from Supabase's magic-link
                                 verify (not PKCE — see note below) and redirects on
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

There's no real Kajabi SSO, and Kajabi's webhook setup turned out to be
split across two unrelated config surfaces — found by testing real
purchases, not from docs:

- **Settings → Third Party Integrations and Webhooks** (global, pick an
  event from a dropdown): `payment.succeeded` fires correctly from here.
  `order.created` is selectable in the same dropdown but **never fired** in
  testing (real purchase, $0 coupon, real $1 purchase — none triggered
  it). Don't rely on it.
- **Sales → Offers → [offer] → "···" → Webhooks → "Purchase Webhook URL"**:
  this is what actually fires on purchase — must be set **per offer**, not
  once globally. Its event is `purchase.created`, with a different,
  flatter payload shape (`payload.member_email`, `payload.offer_title`,
  ...) than the global tab's `payment.succeeded`
  (`member.email`, `offer.title`, ...). The code in
  `app/api/webhooks/kajabi/route.ts` handles both shapes.
- **Kajabi doesn't sign webhooks at all** — no HMAC, no header, nothing to
  verify a delivery came from Kajabi. Worked around by putting a secret
  token in the webhook URL itself (`?secret=...`), checked server-side —
  see `KAJABI_WEBHOOK_SECRET` in `.env.example`.
- **Kajabi Pages can't merge a per-member value into a link** — only static
  "Variants" (pre-built alternate pages per segment). Liquid custom-field
  merge only works inside Kajabi's own emails.

So the flow is: `purchase.created` fires (from the per-offer webhook) → the
app synchronously mints a signed, single-use token and **emails it
directly** to the student (no dependency on Kajabi rendering anything).
Because minting + sending happens the instant the webhook fires — not
queued through Zapier — the email is already there by the time the student
checks their inbox, no password screen. The token rotates on every use.

One layer down, the Supabase session handoff itself needed a fix too:
`admin.auth.admin.generateLink()` + Supabase's `/auth/v1/verify` deliver
the session as a URL **fragment** (`#access_token=...`), not a `?code=...`
query param — fragments never reach the server, so the original
server-side `/auth/callback` route handler could never have worked here.
It's a client-side page now (`app/auth/callback/page.tsx`); the browser
Supabase client's `detectSessionInUrl` picks the fragment up and persists
it into cookies, then the page redirects on to the dashboard. Confirmed
with a real login walked through step-by-step, not just code review.

Cancellation and DNC, which have no webhook to listen for, run on a
**5-minute polling job** (`api/cron/kajabi-sync`). This was originally a
Vercel Cron job, but Vercel's free Hobby plan only allows daily crons — it
now runs from a GitHub Actions scheduled workflow instead
(`.github/workflows/kajabi-sync.yml`), calling the same endpoint, at no
cost. Requires a `CRON_SECRET` repository secret in GitHub matching the one
in Vercel's env vars. See `TSS_App_Spec_1.md` section 1 for the full writeup.

**Confirmed working end-to-end** with a real $1 purchase: the
`purchase.created` handler correctly created a `students` row and a
Supabase auth user, and the payload's top-level `id` field is what
idempotency keys off.

**Before this covers real signups**: the per-offer "Purchase Webhook URL"
has only been set on one offer (Sing Smarter Pro) so far — it needs adding
to every other offer individually (Suite, Elite, bundles) or their
purchases won't provision anything. See spec section 11.

**Still unconfirmed**: the exact response shape of Kajabi's
contacts-custom-field and subscriptions-list endpoints — not in the
publicly available docs, and `api/cron/kajabi-sync` hasn't been tested
against real Kajabi data yet.

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
