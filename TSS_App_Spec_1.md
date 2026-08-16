# Tara Simon Studios — Coaching Platform Spec

**Purpose:** An all-in-one student portal (community, coaching, courses) for Tara Simon Studios, an online vocal studio. Kajabi handles content/commerce/community; a custom app handles everything Kajabi can't — coaching scheduling, attendance, payroll, and student/coach tools. Migrating off Opus1.io. Scaling from ~100 to 400 students.

---

## 1. System Architecture

**Kajabi owns:** offers/tiers, checkout, courses, community feed, upsells/bundles, coupons.

**Custom app owns:** recurring coaching schedule, makeup credits, attendance, payroll, coach/student chat, exercises library, homework notes, entitlement tracking beyond simple tier status.

**Integration point:** custom app talks to Kajabi via its Pro-tier public API (`api.kajabi.com/v1`, OAuth2 `client_credentials`) and webhooks for subscription status and tier. This status gates booking eligibility, slot retention, and makeup-credit validity. One-way sync — Kajabi doesn't need to know about scheduling internals.

**Kajabi's webhook coverage is narrower than a typical platform, and split across two unrelated config surfaces — found by testing real purchases, not from docs:**
- **Settings → Third Party Integrations and Webhooks** (global, pick an event from a dropdown): `payment.succeeded` fires correctly from here on a real purchase. `order.created` is selectable in the same dropdown but never fired in testing — a real purchase, a coupon-based $0 purchase, and a real $1 purchase all failed to trigger it. Treat it as non-functional.
- **Sales → Offers → [offer] → "···" → Webhooks → "Purchase Webhook URL"**: this is what actually fires a purchase event — and it must be set **per offer**, individually, not once globally. Its event is named `purchase.created` and its payload is a different, flatter shape (`payload.member_email`, `payload.offer_title`, etc.) than the global tab's `payment.succeeded` (`member.email`, `offer.title`, ...). **There is no webhook for subscription cancellation, pause, or payment failure**, from either surface.
- **Kajabi does not sign webhooks at all** — confirmed absent from Kajabi's own docs, no HMAC, no header, nothing to verify a delivery actually came from Kajabi. The workaround: the webhook URL configured in Kajabi carries a secret token as a query param (`?secret=...`), checked server-side on receipt — weaker than signing the payload, but it does mean the endpoint only acts on requests that know the secret.
- So: new/renewed access (tier, activation, first login) is event-driven off the real webhooks, synchronously, direct API — no Zapier. Cancellation and DNC detection, which have no event to listen for, run instead as a **5-minute polling job** against the Kajabi API — still direct/no Zapier, just not instant, since Kajabi doesn't expose a faster signal. Interval is adjustable if 5 minutes proves too slow or too chatty against rate limits.
- **Direct-API vs. Zapier split (deliberate):** login and subscription-status sync (upgrades, cancellations, pauses, DNC flagging) are built directly against the Kajabi API/webhooks/polling for speed and reliability. Lower-stakes, non-instant automations — e.g. auto-creating a student's Google Drive folder on signup — are fine to run through Zapier.

**Auth: no real Kajabi SSO exists, so login is a magic-link token built directly against Kajabi's API** (not Zapier):
- On `purchase.created` (the per-offer webhook), the app synchronously mints a signed, single-use login token and **emails it directly to the student** — confirmed that Kajabi's member Pages only support static per-segment "Variants," not per-member dynamic values, so a page-embedded merge-tag link (the original plan) isn't possible; Liquid custom-field merge only works inside Kajabi's own email campaigns. The app's own email is the source of truth for delivery.
- Because the token is minted and the email sent the moment the webhook fires — not queued through Zapier — it's already in the student's inbox by the time they check it, no per-click delay or password screen. The token rotates (a fresh one is minted and re-sent) every time it's consumed, so the same flow works next login too.
- Clicking the link still needs to hand off to a real Supabase session, and that handoff is client-side, not server-side: Supabase delivers the session as a URL fragment (`#access_token=...`), which never reaches a server at all, so the final step is a client-side page picking that up rather than a server route handler. Confirmed by walking a real login through step by step.

**Google Workspace setup (confirmed live):**
- Only one Workspace account exists: `info@tarasimonstudios.com` (admin). Coaches do **not** have their own Workspace seats.
- Each coach has a persistent, recurring Google Meet room created under the admin account, with the coach set as a **durable co-host** — recording already works automatically every session, no per-session promotion needed.
- Recordings save to the **organizer's (admin's) Drive**, not each coach's personal Drive — this centralizes ownership and simplifies API access (backend only needs to authenticate as one admin account, not 4+ coach identities).
- Coaches see their schedule via calendar invites sent to their personal Gmail — each coach's recurring events are created individually, so a coach only ever sees events they're invited to. **Never cross-invite coaches to each other's events** — this is what keeps Celine from seeing Nikki's schedule (and vice versa) at the Calendar layer.
- Video platform: **Google Meet**, confirmed as the right choice over Zoom, GHL Calendar, or Google Classroom — Drive-native recording avoids an extra transfer step, no added per-coach licensing cost, and matches the team's existing workflow. (Zoom has more mature webhooks/attendance APIs, but that advantage doesn't offset losing native Drive recording.)

---

## 2. Subscription Tiers (Kajabi-managed)

| Tier | Price | Commitment | Includes |
|---|---|---|---|
| Sing Smarter Lite | Free | — | Practice sheet, community channel, 7-day challenge (upsell funnel), community feed |
| Sing Smarter Suite | $29.99/mo | Month-to-month | VIP community feed, early YT access, events, all mini courses, all challenges, 10% discount, 1 discounted first/trial lesson with a coach |
| Sing Smarter Pro | $300/mo | 3-month minimum | Everything in Suite + mastercourse unlock after 1 year, 15% discount, exclusive group chat, **4x weekly 30-min coach lessons/month**, 1 quarterly Insta-reaction |
| Sing Smarter Elite | $600/mo | 6-month minimum | Everything in Pro + bi-annual group session with Tara, 2 lifetime success calls with Mimi, 1 lifetime onboarding/goal session, monthly 1-on-1 goal/marketing session, 3x social posts |

**Other products:** mini courses $17 each, master courses $249.99 each, $497 3-month bundle into Suite, group vocal classes $40 add-on, 60-min lesson upgrade +$250/mo, prepay discounts (6-mo upfront $1599, 1-yr upfront $3199), single private lesson $150 (internal), Spotlight $80.

### Kajabi offers — real Offer IDs (confirmed via `GET /v1/offers`, not assumed)

Kajabi was restructured after the original tiers above were priced out — 11 real offers exist today, only 5 of which are tier-relevant to this app. Pulling the live list (rather than trusting titles, which can be renamed) is what caught this:

| Offer ID | Title | Maps to |
|---|---|---|
| `2151043892` | Sing Smarter Lite | tier `lite` — no portal access |
| `2151078893` | Sing Smarter Suite | tier `suite` — one lifetime trial lesson |
| `2151186014` | Sing Smarter Pro (internal: "...- Master Coaches") | tier `pro` — full weekly booking, Master Coach pool |
| `2151340480` | Sing Smarter Elite - Master Coaches | tier `elite` — full weekly booking, Master Coach pool |
| `2151340474` | 60 Minute Session Upgrade | **not a tier** — layers on an existing Pro/Elite sub, sets `session_duration_minutes = 60` |

**Not mapped, deliberately:**
- `2151340477` "Sing Smarter Pro - Coach Tara" and `2151340478` "Sing Smarter Elite - Coach Tara" ($357/mo each) — these exist purely to gate Kajabi's own Courses/Community content for Tara's students. Checkout links are hidden; no one purchases through them. Tara's students are provisioned entirely through the admin ambassador tool (section 8), billed via **Stripe**, not yet integrated — tracked as an open item (section 11).
- `2151333347` "Sing Smarter Elite" (legacy, no suffix, $2,799/6mo) — pre-restructuring offer. Not given a per-offer purchase webhook; any existing subscribers still get `payment_status` synced fine via the tier-agnostic global `payment.succeeded` webhook.

**A real bug this caught:** the webhook handler used to default any *unrecognized* offer to tier `lite`. With the full 11-offer list in view, that would have silently downgraded an existing Pro/Elite student to Lite the moment they bought an unrelated mini-course or master-course. Fixed — unmapped offers now leave the student's tier untouched.

### Portal access by tier

The student portal is an add-on library-card layer on top of Kajabi's own course/community access — how much of *this app* a student can use scales with tier, separately from what Kajabi itself shows them:

| Tier | Portal access |
|---|---|
| Lite | None. No login, no portal at all. |
| Suite | One **lifetime** trial lesson with a coach (see "Trial lesson" in section 5) — bookable once. After it's used (or if never used but the student downgraded from Pro/Elite), portal access is **view-only**: past recordings and homework notes, no new booking. |
| Pro | Full booking access — 4 weekly sessions/month (section 4), plus everything Suite includes. |
| Elite | Same booking access as Pro, plus Elite's other non-portal perks. |

**Upgrades/downgrades change access immediately, not just billing:**
- Downgrade to Lite → portal access fully revoked.
- Downgrade to Suite (from Pro/Elite) → drops to view-only (the trial lesson was already used during their Pro/Elite tenure in the normal case).
- Upgrade Suite → Pro (the coach's post-trial discounted pitch, see section 5) → full weekly booking access resumes right away.

**Ambassadors:** given free portal + course access in exchange for promotion/content, via Kajabi's "Grant Offer" or a 100%-off coupon — confirmed in section 1 that **neither of those fires a purchase webhook**. So ambassador provisioning is a manual **admin action** in this app (assign tier + coach directly), not something that happens automatically off a Kajabi event.

**Entitlement tracking needed beyond a binary tier flag:** one-time perks (trial lesson, mastercourse unlock after 1 year), lifetime perks (Elite success calls, onboarding session), and recurring-but-capped perks (quarterly Insta-reaction, bi-annual group session). Model as a small `entitlements` table per student: perk type, used/unused, expiry or recurrence — separate from the base tier/weekly-slot logic.

---

## 3. Billing Model

**Decision: per-student anniversary billing**, not shared calendar-month billing.

- Each student is billed on whatever day they signed up or upgraded — this was chosen specifically to keep tier upgrades (e.g., Suite → Pro after a trial lesson) frictionless. Forcing every student onto a shared date (e.g., the 1st) would mean delaying a freshly-converted student's coaching start, or manual proration at scale — both bad for conversion at 400 students.
- This replaces the old Opus1.io-driven policy of "bill on the 1st, cancel by the 15th" — that policy existed because of Opus1.io's system constraints, not a Kajabi requirement, and isn't being carried forward as-is.
- **DNC (Do Not Coach) automation:** Kajabi has no payment-failed webhook (confirmed — see section 1), so DNC detection runs on the same 5-minute polling job that catches cancellations, not a real-time event. On detecting a failed/past-due payment it auto-flags the student `payment_status: DNC`, auto-blocks their upcoming sessions in the coach's schedule view (not just a Slack message that could be missed), and auto-posts to Slack notifying the assigned coach. Resolution (student pays via a different card, or is removed) stays a manual admin step. DNC clears automatically once `payment.succeeded` fires (that event does exist) or the next poll sees the payment cleared.
- **No refunds, ever.** The only make-good is completing owed lessons within 30 days of the missed lesson date via the makeup system.
- **Cancellation:** student must call the studio directly; handled off-platform. Since Kajabi has no cancellation webhook (see section 1), this is reflected in the app via the same polling job rather than an event push.
- **Pause subscription:** admin-only for now (toggle a `paused` status with start/end dates) — not self-service. A paused student's slot stays reserved (not shown as open to others) and no sessions/billing accrue during the pause. Written policy (min 2 weeks, max 3 months, once/year, requires 3-month tenure) is enforced by staff process today, not app logic, but the `paused` state and slot-holding behavior are needed in the data model now.

---

## 4. Coaching Program Cycle

**Decision: cycle = each student's own monthly billing period (anniversary to anniversary), not a fixed 28-day rolling cycle.**

- Each Pro/Elite student is entitled to 4 weekly 30-min sessions per billing cycle, matching what Kajabi actually bills for — no separate "coaching cycle" concept apart from billing.
- A weekly slot doesn't divide evenly into a ~30–31 day month, so some cycles contain 5 occurrences of the student's weekly slot instead of 4. Since entitlement caps at 4/cycle, that leftover 5th occurrence simply isn't scheduled/billed. It's not a deliberate "week off" design — just the natural byproduct of a weekly cadence inside a monthly billing window. This only happens in cycles where the math falls that way; not every month has one.
- **Student-facing display must hide this complexity entirely:** students see their next 4 upcoming sessions as normal dates, a plain "week off: [date]" note on any week where the 5th slot would otherwise fall, and their renewal date in plain language ("renews Sep 14 — cancel by Aug 30 to avoid renewal"). No mention of "cycles" or billing-math logic anywhere in the UI.
- Coaches see the actual per-student weekly gaps in their schedule view, since they're the ones juggling multiple students on different billing dates.

---

## 5. Scheduling & Booking Rules

- Students can only book makeups/schedule changes against their **own assigned coach's** open slots — never a different coach (except admin-assigned substitutes, see below).
- **Self-service, fully automatic:** students book makeups and recurring schedule changes themselves in-app; no coach or admin approval needed for standard bookings within policy caps.
- **Coach availability:** coach has working hours (admin-entered, rarely changes) minus personal blocks (time off, usually ~2 weeks notice) minus existing bookings = open slots shown to students.
- **Coaches cannot reschedule, cancel, or modify sessions** — scheduling is admin-only. Coaches are purely instructional. Students must contact the studio (not their coach) for scheduling/billing:
  > "Please contact the studio for scheduling: info@tarasimonstudios.com or +1-866-471-9454 (Text/Call/WhatsApp)"
  Coach chat should have this as a canned quick-reply for scheduling questions.
- **Admin can override any makeup restriction** for special-case exemptions — logged with a required note and an `override_by_admin` flag for audit trail. Coach exceptions (admin-granted) can only be given to a student **once**.

### Trial lesson (Suite tier)

- One lifetime trial lesson per Suite-tier student, modeled as a one-time `entitlements` row — auto-granted the moment a student first reaches Suite (via the `purchase.created` webhook), independent of whatever they do after.
- **Unlike every other booking in this app, the trial lesson is not restricted to the student's assigned coach** — a fresh Suite student may not have one yet. The student picks any coach's open slot themselves, or an admin books it on their behalf and assigns the coach at the same time.
- **Visually distinct on the coach's schedule** (different color from regular/makeup sessions) — the point is to flag the coach that this session ends with a "coach sale": pitch the discounted upgrade into Pro before the student leaves the call.
- Booking the trial does not set `assigned_coach_id` permanently — that's still whatever the studio assigns if/when the student upgrades to Pro.
- **Coach Tara never appears in this picker** — she's admin-side only (section 8). Students choosing a coach for their trial only ever see the Master Coaches (Celine/Ivan/Nikki/Crissy).
- Trial lessons are always a fixed 30 minutes, regardless of anything set on the student's record — the 60-min add-on below is Pro/Elite-only and mutually exclusive with the Suite-tier trial by construction.

### Session duration (60-min add-on)

- Pro/Elite students book 30-min sessions by default. Kajabi's "60 Minute Session Upgrade" offer (`2151340474`) layers on top of an existing subscription and switches a student's `session_duration_minutes` to 60 — it's an entitlement flag on the student, not a separate tier.
- Same flag is settable manually from the admin ambassador tool, for Coach Tara's Stripe-billed students who never purchase the Kajabi add-on at all.
- Slot generation respects this per-student: start times still offered every 30 minutes, but a 60-min student's slots are checked and booked as full 60-min blocks (so e.g. both 2:00 and 2:30 might show until one is booked, same as any variable-length booking system).

### Makeup credit types (three distinct kinds — do not conflate)

| Type | Trigger | Cap | Expiry |
|---|---|---|---|
| Student-fault | Student cancels/no-shows with proper notice | 1/month, 6/year | 30 days from missed session |
| Studio-initiated (planned) | Coach vacation/block | No cap (internally limited by practice) | N/A — student books a real replacement slot via auto-suggest |
| Studio-initiated (emergency) | Same-day coach block, unresolved on the notification call | No cap | No expiry — usable anytime while subscribed; wiped only on subscription end |

Studio-initiated makeups never touch the student's capped credit balance — that's reserved for the student's own fault.

### Coach-block reschedule flow (planned blocks, e.g. vacation)

1. Block added → system calculates days until block starts.
2. **Scaled response deadline** (decided): shorter deadline for less notice, longer for more lead time (e.g., ~24hrs if <7 days notice, ~4 days if ≥7 days notice) — not a fixed deadline, since a flat window is either too tight on short notice or unnecessarily rushes people when there's no real urgency.
3. All affected students notified **simultaneously** with auto-suggested open slots from the same coach.
4. **Real-time slot locking**: the moment one student claims a slot, it's removed from everyone else's options — prevents double-booking and avoids the "first student takes forever, blocking everyone else" problem of a strict sequential system.
5. Student accepts a slot → auto-booked. Deadline passes with no acceptance → falls to admin for manual outreach.

### Emergency (same-day) coach block flow

- Staff calls affected students directly, cancels that day's lesson, tries to book a makeup live on the call.
- If unresolved on the call: add an uncapped, non-expiring makeup credit to the student's account (see table above) — no digital auto-suggest flow needed, this is a manual admin action.

### Substitute coaches

- Reserved right to assign a substitute if: (a) a makeup doesn't fit the regular coach's schedule, or (b) the regular coach can't teach a regularly-scheduled lesson (emergency) — student keeps their normal day/time, just with a different `actual_coach_id` for that one session.
- Data model: student has a permanent `assigned_coach_id` (default, rarely changes) separate from each session's `actual_coach_id` (normally matches, overridden by admin for a substitute).
- **Payroll credits the `actual_coach_id`** — the substitute gets paid for that session, not the regular coach.
- Substitute coaches can see the student's full homework notes/chat history (see Section 8) — needed for context, not a privacy gap, since it's scoped to students they're actually covering.

---

## 6. Attendance & Payroll

- **Attendance is coach-marked, not derived from the video platform** — deliberate choice for reliability (doesn't depend on a third-party API/report) and speed (one tap, right after the session, when the coach's judgment call — e.g. the 15-min late-forfeit rule — is freshest).
- Session status values: `attended` / `no-show` / `late-forfeit` / `cancelled-with-notice (makeup earned)` / `cancelled-no-notice (forfeited)`.
- **Pay logic:**
  - Attended → paid.
  - No-show / late-cancel (no notice) → coach **still paid** (studio still charges the student in full per the no-refund policy).
  - Cancelled **with** proper notice → original slot is replaced by the makeup slot as **one billable event** (paid once for whichever session actually happens, not twice).
  - Makeup session → paid separately, on the makeup itself.
- **Coach rates are per-coach, not global:** e.g. Celine $25/hr, Nikki $40/hr, Ivan $20/hr. Pay per session = `hourly_rate × (session_duration_minutes / 60)`.
- **Adding a new coach = a simple admin form** (name, email, hourly rate, working hours, Meet link co-host setup, Drive folder) — no code changes, just new rows.
- Payroll is a **calculation/export layer inside this app**, not a full payroll system — the app computes what's owed per coach per period (using data it already owns: session status, duration, actual coach); actual disbursement, tax withholding, 1099s etc. go through a real payroll processor (Gusto, Deel, QuickBooks Payroll) via export.
- **Membership auto-termination:** 2 consecutive absences without notice/valid justification flags the account (recommend: flag for admin one-click confirm rather than fully silent auto-cancel, so edge cases like emergencies get a human glance).

---

## 7. Recordings

- Coaches reuse one persistent Meet room all day; they manually hit record when a (possibly late) student joins, stop by leaving the room (which ends the call), then re-enter for the next student. **Actual recording start/stop times don't line up cleanly with scheduled session times** — this makes timestamp-based matching unreliable.
- **Matching approach (recommended): sequential + one-tap human confirm, tied to the attendance-marking action.**
  1. Coach finishes a session, marks attendance (already doing this).
  2. App finds the newest unmatched recording in the admin Drive for that coach.
  3. One-tap confirm: *"Is this the recording for [Student], [time]? ✓ Yes / Reassign."*
  4. On confirm, app renames/moves the file into the student's Drive folder via the Drive API.
  - No-shows naturally have no orphan recording to worry about. "Reassign" opens a quick picker of that day's recent unmatched files for edge cases.
  - **Safety net:** an admin-facing "unmatched recordings" view surfaces anything left unconfirmed after ~24 hours.
- **Student Drive folder auto-creation:** planned via Zapier — trigger on new Pro/Elite Kajabi subscription → create a Drive folder (consistent naming, e.g. `LastName_FirstName_StudentID` to avoid collisions) → write the folder ID/link back into the app record.
- Recording storage note: at 400 students × up to 4 sessions/month, volume could get heavy. Plan is to build on Drive now with strict per-student foldering, and revisit a dedicated video-hosting layer only if storage/cost becomes an actual issue.

---

## 8. Coach / Student / Admin Views

### Coach side (permissions: read-only on scheduling, write on a few specific things)
- **Coach Tara** gets the exact same coach access as the Master Coaches (Celine/Ivan/Nikki/Crissy) — same dashboard, same calendar, same student snapshot panel/chat/homework notes, no separate one-off view. Provisioning her account is the identical process (admin-created Supabase auth user + coach role) as the Master Coaches. The one difference: `hidden_from_students = true` on her coach row, so she never appears in the student-facing trial-lesson coach picker (section 5) — **admin-only** to assign her, e.g. through the ambassador tool.
- View own schedule only (never another coach's — enforced by data scoping, not just UI), as a **full calendar grid** (day/week toggle), color-coded: grey = open/available within working hours, purple = a booked student session (trial lessons get an amber border on top of the purple, so the coach knows to pitch the Pro upgrade — section 5), black = a coach block (break, time off), and anything outside working hours simply isn't shown.
- **Coaches are spread across multiple timezones** — each coach has their own `timezone`, and their calendar always displays in that zone regardless of who's viewing. Admin's coach-schedule view (below) is the one exception: normalized to Eastern for every coach, so admin can compare across coaches without doing zone math themselves.
- Mark attendance (Attended / No-show / Late-forfeit) — their one scheduling-adjacent write action. Click any past session directly on the calendar grid to mark it; marked sessions show a small status indicator (✓ / ✗ / L) on the block going forward.
- Click into a session (e.g. "Caleb 5:30–6:00pm") to open a **student snapshot panel**: chat box, student's upcoming schedule, makeup credit count, subscription tier, Google Drive folder, Homework Notes
- Homework Notes: dated running log, **visible to the student**, shows recent ~5–8 entries by default with expand-for-more (don't dump full multi-year history), optionally pin important notes
- Chat with assigned students, with attachments
- Dashboard: this week's schedule, students' birthdays this week (informational only for now — GHL marketing tie-in is a future idea, not needed now), and which students have makeup credits expiring soon (30-day-expiry type only — the no-expiry emergency credits shouldn't clutter this) so the coach can nudge them personally
- Assign exercises to a student from a dropdown (Exercises library, see below)
- Own payroll summary for the pay period
- No visibility into other coaches' schedules or students

### Student side
- Recurring weekly slot + upcoming sessions (shown as plain dates, not "cycle" logic)
- Self-book makeups/schedule changes against their own coach's open slots
- See remaining makeup credits and expiry dates
- Chat with their coach, with attachments — in-app only, notified (not exposed contact info) when the coach replies
- View their own past session recordings (from their Drive folder)
- View exercises assigned to them (gated by active subscription) — non-downloadable in-app player, not raw Drive links
- Homework notes (same dated log the coach sees)
- Plain-language renewal/cancel-by date

### Admin/owner side
- Full visibility across all coaches — schedules, capacity, payroll rollup. Schedule view uses the same calendar grid coaches see, but **always normalized to Eastern time** regardless of each coach's own timezone, so admin can compare across coaches directly.
- DNC flag management, no-show/absence review and termination confirms
- Manual pause/resume toggling
- Manual admin overrides on makeup restrictions (logged, one-time-per-student cap on exceptions)
- Manual substitute-coach assignment
- Assign a coach and book the trial lesson on a Suite student's behalf (section 5) — students can also do this themselves
- Manual ambassador provisioning (assign tier + coach directly) for Grant Offer / 100%-off-coupon students, since neither fires a purchase webhook (section 2)
- Unmatched-recordings safety net view
- Exercises library management (add/edit the mp3 catalog coaches assign from)
- New-coach onboarding form

---

## 9. Chat / Anti-Poaching

- Coaches and students communicate **only in-app** — goal is preventing off-platform contact exchange ("poaching").
- Thread auto-created the moment a student is assigned to a coach — no manual setup per student.
- **Notification, not two-way email relay** (deliberate choice): when a message arrives and the recipient isn't active in-app, send a generic notification ("You have a new message from [Name] — tap to view and reply") linking back into the app. No message content or real email/phone exposed in the notification.
- Two-way masked email relay (reply-by-email) was considered and rejected — more infrastructure to build/maintain, and it undermines the anti-poaching goal by normalizing email-based exchange instead of requiring the app.
- Future idea (not built now): lightweight content filter flagging phone numbers/emails typed into chat.

---

## 10. Exercises Library

- Replaces manually placing Drive file shortcuts in student folders.
- Coach assigns from a dropdown/library (title, description, mp3, category/tag) to a specific student.
- Student sees only what's been assigned to them, gated by active subscription (reuses the same entitlement/DNC gating logic as everything else).
- Delivered via an in-app audio player (no visible download button, no direct file URL exposed) rather than a Drive view link — meaningfully raises the friction on saving/redistributing content, though true un-downloadable audio isn't fully achievable and shouldn't be oversold as airtight.

---

## 11. Open Items / Not Yet Decided

- Exact numeric thresholds for the scaled reschedule-response deadline (e.g., confirm "24hrs vs 4 days" split against real notice-period data once live).
- Whether a shared "studio closed" period (e.g., holidays) should exist as a hard block independent of each student's own billing cycle.
- Recording storage strategy once volume is closer to 400 students (Drive vs. dedicated video hosting).
- Resolved: Kajabi Pages don't support per-member merge tags (only static Variants; Liquid custom-field merge is email-only) — login link is emailed directly by the app instead (see section 1).
- Exact Kajabi API response shapes for the contacts custom-field update and subscriptions list endpoints — not in the publicly available docs; confirm against the OpenAPI spec once Pro-tier credentials exist.
- Whether 5 minutes is the right polling interval for the cancellation/DNC reconciliation job, once real data shows how urgent same-day detection actually needs to be.
- **Operational, not code — needs manual verification in the Kajabi dashboard** (can't be checked via API, confirmed no `/webhooks` endpoint exists): the per-offer "Purchase Webhook URL" (section 1) needs to be set on all 5 tier-relevant offers — `2151043892` (Lite), `2151078893` (Suite), `2151186014` (Pro), `2151340480` (Elite - Master Coaches), `2151340474` (60-Min Add-on). Only Pro was confirmed set as of the last real-purchase test; **don't assume any of the other four are already done** — this was specifically flagged after Pro/Elite turned out to have been restructured with new Offer IDs, which would have silently orphaned any webhook still pointed at an old ID.
- **Stripe integration for Coach Tara's students — not yet built.** Her students are billed outside Kajabi entirely; provisioning currently goes through the admin ambassador tool by hand. Needs scoping as its own piece of work.
- **Needs live verification, not assumed**: does the coach dashboard show a student assigned to a coach (`assigned_coach_id`) before any session exists between them? The calendar is session-driven (a coach only sees students they have actual sessions with) — there's no separate "my assigned students" list yet. This matters specifically for Coach Tara's ambassador-provisioned students, who might be assigned before their first session is booked. Untested as of this writing.
- Possible future: student-facing self-service pause requests (currently admin-only); GHL birthday marketing emails; standalone scheduling app; phone/email content-filtering in chat.
