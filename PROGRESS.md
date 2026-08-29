# TSS Student Portal — Progress Log

Working notes so nothing gets lost across sessions. Update this file at the
end of each work session rather than relying on chat history.

## Students page: made the two collapsed buttons look like real buttons (2026-08-28)

"Add a new student" and "Import students from CSV" were styled as plain
underlined text links (`styles.linkBtn`) — you wanted them to read as
actual purple buttons, same weight as "Save" elsewhere on the page.
Both now use `styles.cta` (the same class the forms' own submit buttons
already use) and title-case labels: "Add A New Student", "Import
Students From CSV".
([provision-student-client.tsx](app/(admin)/admin/dashboard/provision-student-client.tsx),
[import-students-client.tsx](app/(admin)/admin/dashboard/import-students-client.tsx))
`npx tsc --noEmit -p .` and `next build` both clean.

## Student dashboard "Next session" ignored group lessons (2026-08-28)

You caught this live-testing student access: a student registered for
a group lesson bootcamp (8/31) still saw a later 1:1 session (9/9) as
their "Next session" — the hero card's query
(`app/(student)/student/dashboard/page.tsx`) only ever looked at the
`sessions` table, never `group_lesson_registrations`, so a sooner group
lesson could never win. Now compares both and shows whichever is
chronologically first. Group lessons had no meet-link concept at all
before this — [`lib/group-lessons.ts`](lib/group-lessons.ts)'s
`getStudentUpcomingGroupLessons` now also selects the coach's
`meet_link` (reusing their same standing room, same as 1:1s — no
separate per-lesson video link exists anywhere in this app) so the
Join button can appear for a group lesson too, same 10-minutes-early
timing as a regular session (confirmed by reading `join-button.tsx`
directly — `EARLY_JOIN_MINUTES = 10`, unaffected by this bug).

**Known gap, not fixed here**: `/api/student/join-click`'s ownership
check only queries `sessions`, so a click on a group-lesson Join button
gets silently rejected by that endpoint (403, swallowed by
`sendBeacon`'s fire-and-forget nature) — the actual join still works
fine (the link opens regardless), it just won't show up in the
Activity Log's audit trail. Would need `activity_events.session_id`'s
FK loosened or a parallel column to fix properly; scoped out since it's
audit-log completeness, not user-facing breakage.

## Students page: collapsed the Add form, simplified the CSV hint text (2026-08-28)

Two readability fixes you asked for on the Students page.

**"Add ambassador / manual student" now starts collapsed** behind an
"Add a new student" button, same pattern as "Import students from CSV"
right below it — was always fully expanded before, taking up the whole
top of the page regardless of whether anyone was using it.
([provision-student-client.tsx](app/(admin)/admin/dashboard/provision-student-client.tsx))

**CSV import hint text rewritten** — the old version was one dense
paragraph mixing plain English with raw column names
(`day_of_week`/`coach_since`/`address_*`/`guardian_*`) and buried the
most important behavior (re-uploading an existing student's email
backfills their contact info instead of creating a duplicate) at the
end of a run-on sentence. Now a short bulleted list in plain language;
still names the handful of columns someone actually has to think about
(coach, day/time pairing, coach-since needing a coach), but drops the
column-name-as-prose style everywhere else.
([import-students-client.tsx](app/(admin)/admin/dashboard/import-students-client.tsx))

`npx tsc --noEmit -p .` and `next build` both clean.

## Student migration fields: address, phone, gender, guardian info (2026-08-28)

Migrating students in from the old system (Opus1/Kajabi export) surfaced
that this app never captured phone, gender, or address. Added 11 new
nullable columns on `students`
([0070_student_contact_and_guardian_info.sql](supabase/migrations/0070_student_contact_and_guardian_info.sql)):
`phone`, `gender`, `address_street/city/state/zip/country`,
`guardian_name/relationship/phone/email`. `gender` is free text, not an
enum — the source data itself is wildly inconsistent ("Female", "Girl",
"F", "she/her", "rather not say"...) and a fixed set would be lossy.
One guardian per student, plain columns on `students` (not a second
login account, not Opus1's old accounts-and-dependents system) — same
protection model email/phone already use (RLS on `students` is
row-level only; privacy is enforced by which columns each query
selects, confirmed by grep: `phone`/`address_street`/`address_zip`/
`guardian_*` appear nowhere outside `app/(admin)`).

**Coach visibility** — confirmed with you directly: coach sees
city/state/country + gender + age + full birthday, never street/zip/
phone/email/guardian info. `getStudentSnapshot` and
`getBirthdaysThisWeek` ([lib/coach/dashboard-data.ts](lib/coach/dashboard-data.ts))
updated accordingly. Worth flagging: this reverses an existing
*intentional* choice — `getBirthdaysThisWeek` used to strip the birth
year specifically so a coach couldn't infer age ("the stored year is
never surfaced to a coach"). Caught a real off-by-one while building
this: the "turning N" age on an upcoming birthday needs the age as of
*that* birthday, not `calculateAge()`'s "age as of today" (which is
one less until the birthday actually happens) —
[dashboard-data.ts](lib/coach/dashboard-data.ts) computes it directly
from the matched calendar date instead of reusing the generic helper.

**Admin UI** — new click-to-edit panels on the student detail page:
Phone/Gender (extended
[set-student-info/route.ts](app/api/admin/set-student-info/route.ts),
reusing name/email's existing grouped-route pattern, via a new generic
[simple-text-field-client.tsx](<app/(admin)/admin/students/[studentId]/simple-text-field-client.tsx>)),
Address (5 fields, one Save —
[address-client.tsx](<app/(admin)/admin/students/[studentId]/address-client.tsx>)
→ [set-address](app/api/admin/set-address/route.ts)), and Guardian
info (4 fields, one Save —
[guardian-info-client.tsx](<app/(admin)/admin/students/[studentId]/guardian-info-client.tsx>)
→ [set-guardian-info](app/api/admin/set-guardian-info/route.ts)).

**Staff Notes: pinning** — sibling/family info goes here as free text
per your own suggestion, rather than new schema.
[0071_staff_notes_pinned.sql](supabase/migrations/0071_staff_notes_pinned.sql)
adds `pinned` + (critically) the UPDATE RLS policy `staff_notes` never
had — without it, toggling pinned would've silently no-op'd under RLS,
the exact "0-row filtered update" gotcha this codebase has hit before.
Same double-order pattern `homework_notes` already uses.

**CSV import — confirmed with you directly**: re-uploading should
backfill these fields onto *existing* matching students too (most of
the ~93 rows in the Opus1 export are already active students), not
just apply to new imports — but you don't want the real file uploaded
yet, just the template ready. Changed
[bulk-import-students/route.ts](app/api/admin/bulk-import-students/route.ts):
previously, a row whose email matched an existing student was a **hard
validation error that failed the entire upload**. Now it's a second
code path — tier/coach/schedule/session-duration/ambassador are not
validated or touched at all for that row; only the 11 new fields are
considered, and only backfilled where the existing value is currently
blank (**fill blanks, never overwrite** — nothing typed into the admin
UI can get silently clobbered by a re-upload). Verified this exact
logic (new/existing classification, blank-only merge, no-overwrite) via
a standalone trace script against 3 cases before considering it done.
Template ([import-students-client.tsx](<app/(admin)/admin/dashboard/import-students-client.tsx>))
extended with the 11 new columns; results now report
created/backfilled/failed instead of just created/failed.

Verified via `tsc`/`next build` (clean), a grep confirming no sensitive
column leaks into coach/student-facing code, an interactive mock
(scratchpad, no live login in this environment) click-testing the
Address/Guardian editors and the Staff Notes pin toggle, and the CSV
backfill trace above.

## delete_student_permanently(): a third real failure, same class of bug (2026-08-28)

0069's retest hit a new one: `update or delete on table "profiles"
violates foreign key constraint "students_profile_id_fkey" on table
"students"` — `students.profile_id -> profiles.id` (migration 0001, the
literal link between a student and their own login) was deleted
backwards: 0069 deleted `profiles` before deleting the `students` row
that still pointed to it. Same class of mistake as 0069's own fixes,
just for arguably the single most obvious FK of all of them — missed
specifically because every earlier fix this session was about a table
pointing to sessions/entitlements, and this pattern-matching blind spot
meant not re-checking students' own outgoing reference.

Fixed in [0072_fix_delete_student_permanently_profile_order.sql](supabase/migrations/0072_fix_delete_student_permanently_profile_order.sql)
(renumbered from an initial 0070 — a concurrent session independently
claimed that number for the contact/guardian-info migration above)
— pure reorder, no new nulling needed: delete the `students` row at the
end of Phase 2 (everything that could reference it is already gone by
then), and only touch `profiles` in a new Phase 3 afterward. Also
re-verified by hand that no other table referencing `profiles(id)`
(`coaches.profile_id`, `admin_overrides.admin_profile_id`,
`chat_messages.sender_profile_id`, `student_requests.resolved_by`,
`attention_items.resolved_by`) can still hold this student's own
profile_id by the time Phase 3 runs — all of them are either a
different person's profile entirely (an admin/coach, never the
student), or already deleted as part of Phase 2.

Given this is now the third real bug found only by actually running it
against live data, **please retest again after applying 0072** — same
test student shape as last time (trial entitlement + recurring
schedule) plus, ideally, one with at least one chat message and one
homework note this time, since those weren't confirmed exercised by the
previous test either.

## Fixed delete_student_permanently(): a real delete failed, and a full re-audit found two more latent bugs (2026-08-28)

The first real Delete against a live student hit: `update or delete on
table "entitlements" violates foreign key constraint
"sessions_trial_entitlement_id_fkey" on table "sessions"` —
`sessions.trial_entitlement_id` (added migration 0005, for trial-lesson
booking) was never nulled before deleting `entitlements` in 0068.
Confirms the earlier "tested successfully" note from a few hours ago
was real but incomplete — that test student apparently had no trial
entitlement/session link, so this exact path never ran.

Rather than patching just the one column that broke, re-audited every
`references sessions/entitlements/makeup_credits/recurring_schedules/
student_requests` in the whole migrations folder by hand (grepped every
`alter table ... add column` for these tables too, not just the base
`create table`s) and found two more gaps that hadn't triggered yet
purely because Postgres stops a transaction at its first violation —
the entitlements failure was masking these:
- `entitlements.used_session_id -> sessions.id` (0005) — the *other*
  half of a second circular reference, separate from the
  sessions/makeup_credits one 0068 already handled correctly.
- `sessions.recurring_schedule_id -> recurring_schedules.id` (0020) —
  0068 deleted `recurring_schedules` before `sessions`, backwards; would
  have hit almost any real student (anyone with a regular weekly slot).
- `attention_items.request_id -> student_requests.id` (0035) — same
  backwards-order bug, smaller blast radius.

Fixed in [0069_fix_delete_student_permanently.sql](supabase/migrations/0069_fix_delete_student_permanently.sql)
(`create or replace function`, same function name/signature — no route
changes needed). Restructured into two explicit phases instead of
threading more fixes into the middle of one delete sequence: Phase 1
nulls every nullable cross-reference scoped to the student first
(breaks every circular/backwards dependency in one pass), Phase 2
deletes everything, with ordering only still mattering for the
remaining one-directional NOT NULL references (`payroll_entries` before
`sessions`, `chat_messages` before `chat_threads`).

Still not live-tested — same caveat as 0068's own entry: please retest
the very first delete after this migration on a disposable student
before trusting it again, ideally one WITH a trial entitlement and a
recurring schedule this time, since those are exactly the two things
that would have caught both new bugs.

## Archive and permanently-delete a student (2026-08-28)

There was genuinely no way to remove a student at all before this —
"Stop" on the detail page only cancels the subscription, the row stays
in the list forever. You asked for both: a reversible archive, and a
real permanent delete available for any student (confirmed via a
warning popup, not restricted to students with no history).

**Archive** — new `students.archived` boolean (migration
[0067_student_archived.sql](supabase/migrations/0067_student_archived.sql)),
same no-new-RLS posture as `ambassador`/`referred_by_coach_id`. Every
row (sessions, credits, payroll history) stays exactly as-is; it only
hides the student from the default Students list. Toggle + a "Show
archived" checkbox in
[student-table.tsx](<app/(admin)/admin/dashboard/student-table.tsx>),
new [archive-student/route.ts](app/api/admin/archive-student/route.ts).

**Permanent delete** — `window.confirm` warns exactly what's about to
happen before anything runs. The actual deletion is a single Postgres
function, not sequential JS deletes, so a failure partway through rolls
back everything instead of leaving a half-deleted student
(migration [0068_delete_student_permanently.sql](supabase/migrations/0068_delete_student_permanently.sql)).
Deletes across every table with a `student_id` (sessions, credits,
entitlements, notes, chat, group-lesson registrations, recurring
schedule, magic-link tokens, staff notes, attention items, payroll
entries tied to those sessions) plus two real gotchas worth knowing if
this ever needs touching again:
- `sessions` and `makeup_credits` reference each other
  (`makeup_credit_id` / `source_session_id` / `used_session_id`) — both
  directions are nulled before either table's rows are deleted, or
  neither could go first.
- `activity_events.actor_id` is NOT NULL and the table has no
  update/delete policy by design (an event row is meant to be immutable,
  migration 0065) — so this student's own login/join-click events are
  deleted outright rather than left dangling, while `audit_log.actor_id`
  (nullable — "null = system") is just nulled, keeping the audit record
  itself intact.
`is_admin()` is checked inside the function itself (security definer
bypasses RLS entirely, so this isn't optional) — same defense-in-depth
every RLS policy in this schema already has. Returns the deleted
student's `profile_id` so
[delete-student/route.ts](app/api/admin/delete-student/route.ts) can
also remove the actual Supabase auth user afterward (needs the
service-role client, which the database function has no access to).

**Not live-tested** — this project's own convention is real login only,
no direct Supabase testing, and this is genuinely the most destructive
thing built this session. Verified by re-reading every table/column
name against the actual migrations one at a time (not from memory) and
tracing the two cross-reference gotchas above by hand; `npx tsc --noEmit
-p .` and `next build` both clean, but please treat the very first real
delete as a live test — try it on an actual disposable test student
first, not a real one, before trusting it fully.

## Removed the "Coach time-off blocks" panel from the Students page (2026-08-28)

You didn't want it there — it was a pre-existing panel showing the next
20 current/upcoming `coach_blocks` rows, but now that recurring time-off
rules (Team Huddle, standing breaks) materialize real rows every week
for a year out, that list is mostly repeats of the same few standing
rules rather than useful signal, and it's redundant with the per-coach
"Time off" panel on the Coaches page anyway (which now has its own
list + remove, see the entries above). Removed the panel and its query
from [app/(admin)/admin/dashboard/page.tsx](app/(admin)/admin/dashboard/page.tsx)
— nothing else read that query. `npx tsc --noEmit -p .` and `next build`
both clean.

## Activity Log: search by person's name (2026-08-28)

You asked to search the Activity Log by name — student, coach, or
admin — instead of only being able to filter by an already-known
`actorId`. Added `searchActorIdsByName()`
([resolve-actor-names.ts](lib/admin/resolve-actor-names.ts)), the
reverse of the existing `resolveActorNames()`: an `ilike` search
across `students.name`/`coaches.name`, plus a paginated walk of
`auth.users` (same reason `findAuthUserByEmail` in
`lib/auth/resolve-account.ts` walks every page rather than just the
first — a single unpaginated call could silently miss an admin account
past the first page) filtered by email substring, since admin/
admin_finance accounts have no name column to search.

[activity-log/route.ts](app/api/admin/activity-log/route.ts) resolves
the name to a set of `actor_id`s *before* building the main query — a
search matching nobody short-circuits to an empty result instead of
silently falling through to an unfiltered one. The "Person" search box
([activity-log-client.tsx](<app/(admin)/admin/activity-log/activity-log-client.tsx>))
debounces 300ms before firing, since the admin-account lookup walks
`auth.users` pages server-side and isn't free to re-run on every
keystroke.

Verified via `tsc`/`next build` (clean) and a standalone debounce mock
(scratchpad) confirming one fetch fires after typing settles, not one
per keystroke.

## One-off "Add time off" had no confirmation, no list, no way to remove one (2026-08-28)

You tested it live — added a Sep 1–3 vacation for Celine Larque, got no
confirmation it worked, and then had no way to see it again or take it
back. Two real, separate bugs, both now fixed:

**No confirmation**: the parent panel's `onAdded` callback for this form
called `setPanel(null)` right after a successful add — closing the
entire "Time off" modal the instant it succeeded, before anything could
register as "done." ([all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>))
Now matches the recurring form beside it, which never closed the panel
on its own: `onAdded={refetchSchedules}`, panel stays open, "Close" is
the only thing that dismisses it.

**No way to see/remove one**: `/api/admin/coach-blocks` had a POST and
nothing else — no GET, no DELETE, ever, for this whole feature. Added
both. GET excludes anything tied to a `recurring_coach_block_id` (those
stay managed from the Recurring time off list's own Stop, so they don't
show up twice in two different places) and includes anything not fully
past yet, so a currently-in-progress block is still visible/removable.
DELETE is a real hard delete — unlike a recurring rule's Stop, which
soft-deactivates the rule that's still there, a one-off block has no
rule behind it worth preserving.
[add-coach-block-form.tsx](components/add-coach-block-form.tsx) now
shows that list below the form (same shape as the recurring list next
to it — form fixed at top, list underneath) with a "Remove" per block;
seeing the new entry land in that list on save is now what serves as
the missing confirmation. Your test Sep 1–3 block for Celine Larque is
already a real row — it'll show up in this list once this deploys, so
you can remove it there rather than needing anything done manually.

No migration needed — pure API + UI gap, the table already had
everything required. `npx tsc --noEmit -p .` and `next build` both
clean.

## Recurring time off: list moved below the form, added a start date (2026-08-28)

Two fixes to the "Recurring time off" panel you just saw get its first
few rules — you flagged it'd get cluttered fast with the list sitting
above the add-form, pushing the form further down every time someone
adds a rule.

**Reordered**: the rules list now renders below the form (with a
divider), not above it — the form stays in a fixed spot regardless of
how many rules pile up
([add-recurring-coach-block-form.tsx](components/add-recurring-coach-block-form.tsx)).

**Added a "Starts on" date**, optional, defaults to right away when left
blank. New nullable `recurring_coach_blocks.start_date` column (migration
[0066_recurring_coach_block_start_date.sql](supabase/migrations/0066_recurring_coach_block_start_date.sql)
— 0064/0065 were already claimed by the concurrent audit-log session).
`materializeRecurringCoachBlocks()` ([lib/coach-blocks.ts](lib/coach-blocks.ts))
now computes an `effectiveFrom` from it, same pattern
`materializeRecurringSessions` already uses for
`recurring_schedules.start_date` — a future start date just pushes the
first materialized occurrence out, nothing materializes before it. A
rule with a future start date shows "(starts YYYY-MM-DD)" in the list;
one starting today/already-active shows nothing extra, to keep the list
itself uncluttered.

No data migration needed — every existing rule's `start_date` is null,
which already means "immediately," so nothing about currently-running
rules changes. `npx tsc --noEmit -p .` and `next build` both clean.

## Activity / audit log (2026-08-28)

You asked for a log of "everyone's movement" — logins, data changes
(email/tier being the examples you gave), and specifically whether a
student actually clicked Join, to settle "I was waiting and no one
showed" disputes. You also asked whether it'd slow the app down and
floated hosting it externally instead.

**Data changes** — [0064_audit_log.sql](supabase/migrations/0064_audit_log.sql)
adds a generic `audit_log` table plus a `security definer` trigger
function attached to 8 disputable tables (`students`, `coaches`,
`recurring_schedules`, `coach_blocks`, `recurring_coach_blocks`,
`makeup_credits`, `sessions`, `student_requests`). Chose a Postgres
trigger over instrumenting routes individually because there are 46
write-site API routes with no centralized data-access layer — a
per-route approach would be fragile and already misses a real case:
the Kajabi webhook silently overwrites `students.email`/`tier` via
upsert, which a route-by-route audit would need to remember to cover
separately. The trigger captures every write regardless of which code
path made it. Actor is `auth.uid()`, called directly inside the
trigger — verified this resolves correctly by confirming this exact
codebase already relies on the identical mechanism
(`auth_student_id()`/`is_admin()` in migration 0007, both `security
definer` + `auth.uid()`, called from ordinary `supabase-js` requests
throughout existing RLS policies). No extra plumbing needed in any of
the 46 routes. Service-role writes (webhook, cron) correctly log a
null actor, rendered as "System" in the UI. No-op UPDATEs (a save that
re-writes identical values, or only bumps `updated_at`) are skipped so
the log stays signal, not noise.

**Logins + join-clicks** — [0065_activity_events.sql](supabase/migrations/0065_activity_events.sql)
adds a separate `activity_events` table (different shape — app-logged
events, not row diffs). Login capture added at both places a login
actually completes: `app/auth/callback/page.tsx` (magic-link flow,
after `setSession()`) and
[verify-login-code/route.ts](app/api/auth/verify-login-code/route.ts)
(the 6-digit-code flow, after `verifyOtp`) — both fire-and-forget,
matching the existing detached `.catch()` pattern already used by
`issueAndSendLoginLink` in the Kajabi login route, not Slack's
awaited-but-caught pattern (which still costs latency). Join-click
tracking is genuinely new — [join-button.tsx](<app/(student)/student/dashboard/join-button.tsx>)
was a bare `<a>` with zero tracking before this; it now fires
`navigator.sendBeacon` to a new
[join-click](app/api/student/join-click/route.ts) route on click,
non-blocking so it can't delay the tab opening. Evidence-strength
caveat worth remembering: **absence** of a join-click row is strong
evidence ("no record they ever attempted to join"); **presence** is
good but not cryptographic (a determined student could POST directly)
— fine for the dispute case this was built for, just not unconditional
proof.

**Performance/hosting** — confirmed with you directly: kept this
in-app rather than a separate tool. The write cost (trigger firing per
change) happens inside Postgres in the same transaction as the write
regardless of which frontend issued it, so a separate viewer wouldn't
reduce that cost at all — it would only add a second Supabase
credential exposure surface and a second deployment to maintain, for
no offsetting benefit at this app's scale (single studio,
dozens-to-low-hundreds of students).

**Viewing UI** — new admin-only [Activity Log](app/(admin)/admin/activity-log)
page (`requireRole` already covers it via the `(admin)` layout, no
page-level re-check needed — confirmed other non-Finance admin pages
don't self-check either), linked in the nav. Two tabs backed by
independently-paginated API views (`?view=changes|events`) rather than
one merged feed — `audit_log` and `activity_events` are differently
shaped, and cross-table keyset pagination wasn't worth it for the UX
gain at this scale. Data Changes tab shows an expandable field-level
diff (`tier: "suite" → "pro"`) via
[diff-summary.ts](lib/admin/diff-summary.ts) rather than raw JSON
blobs. Actor names resolved via
[resolve-actor-names.ts](lib/admin/resolve-actor-names.ts) — `profiles`
itself has no name/email, so students/coaches resolve through their
own tables and admin/admin_finance falls back to `auth.users` email.

No retention/pruning added — at this studio's real scale even years of
accumulation is trivial against Supabase's free-tier cap, and Vercel
Hobby's one daily cron slot stays reserved for `materialize-recurring`.
A manual prune button is the right fallback if this is ever actually
needed.

Verified via `tsc`/`next build` (clean) and an interactive mock
(scratchpad, no live login in this environment) — confirmed tab
switching, filters, the "System" actor rendering for a null-actor row,
and the diff view correctly showing only the field that changed
(`tier`) while excluding the unchanged one (`email`) from the same
fixture row.

## Fixed "Add coach"/"Add student" feeling stuck: stopped blocking on email send (2026-08-28)

You hit this live — "Add coach" sat on "Adding…" for several seconds
before the button moved, even though the coach was actually created
right away. Root cause: both `provision-coach` and the shared
`provisionStudent()` helper (used by "Add student" and every row of the
CSV import) awaited 2-3 sequential external network calls — Supabase
Auth's `generateLink`/`createUser`, then Resend's email API — before
ever sending the HTTP response back to the browser. None of that work
is needed for the response itself; it only matters for the login email
arriving eventually.

Fix: moved the non-essential tail (Drive folder creation +
`generateLink` + `sendEmail`) into `waitUntil()` from the
[@vercel/functions](https://www.npmjs.com/package/@vercel/functions)
package (new dependency — Next.js's own `after()` needs a newer Next
version than this project's 14.2.35, tried first and reverted when
`unstable_after` turned out not to exist in that version at all).
`waitUntil` tells Vercel to keep the serverless function alive until
that promise finishes, instead of freezing it the instant
`NextResponse.json(...)` returns — so the response comes back as soon as
the real coach/student row + auth login exist, and the email send
finishes in the background afterward rather than blocking the UI.
Touched: [provision-coach/route.ts](app/api/admin/provision-coach/route.ts),
[lib/admin/provision-student.ts](lib/admin/provision-student.ts) (so this
also speeds up "Add student" and every row of the CSV bulk import).

Separately checked the coach-schedule "Loading…" spinner you also
flagged — [coach-schedule/route.ts](app/api/admin/coach-schedule/route.ts)
already parallelizes its 4 queries with `Promise.all`, nothing obviously
slow there; that one's more likely an ordinary Vercel cold-start moment
(same root cause behind "everything feels slow" generally) than a
distinct bug — not changed.

`npx tsc --noEmit -p .` and `next build` both clean. `waitUntil` degrades
safely outside a real Vercel runtime (confirmed by reading its source —
`getContext().waitUntil?.(promise)`, optional-chained), so local dev
isn't affected.

## Recurring coach time-off blocks (2026-08-28)

You asked for standing weekly blocks: Team Huddle every Monday 10:30am
ET for every coach, plus per-coach ones like Celine's lunch or Nikki's
dinner. New `recurring_coach_blocks` table (migration
[0063_recurring_coach_blocks.sql](supabase/migrations/0063_recurring_coach_blocks.sql)) —
`coach_id` nullable means "every currently-active coach," re-expanded
on every materialize run so a newly added coach picks up Team Huddle
automatically. `timezone` is explicit per rule rather than derived,
since the two cases genuinely differ: a coach's own lunch break is
wall-clock in *their* zone, but "10:30am ET" is one fixed time the
whole team shares regardless of each coach's own zone.

[lib/coach-blocks.ts](lib/coach-blocks.ts)'s `materializeRecurringCoachBlocks`
reuses the exact materialize-forward pattern `materializeRecurringSessions`/
`materializeRecurringGroupLessons` already use — critically, it writes
into the *existing* `coach_blocks` table, so every consumer that
already reads it (booking slot generation, coach/admin calendars, the
dashboard's upcoming-blocks list, coach utilization metrics) respects
recurring blocks with zero changes. Wired into the daily cron
([materialize-recurring/route.ts](app/api/cron/materialize-recurring/route.ts)),
ordered before session/group-lesson materialization. Stopping a rule
(`deactivateRecurringCoachBlockRule`) deletes its future,
not-yet-started materialized blocks — deliberately different from how
stopping a recurring group-lesson series leaves future occurrences
alone (students have registered there; nothing analogous is true of a
block, which only ever removes availability, so leaving stale ones
around after the rule is stopped would just waste coach time).

UI: new [add-recurring-coach-block-form.tsx](components/add-recurring-coach-block-form.tsx),
rendered alongside the existing one-off `AddCoachBlockForm` in the
same "Time off" modal (`all-coaches-day-client.tsx`) rather than a
mode toggle on that form — its own comment already states a
deliberate "always visible, nothing structurally different" simplicity
for one-off blocks that a recurring rule's different shape (day/time/
duration, no end date, an "all coaches" checkbox) didn't fit cleanly
into.

Also closed a real gap this surfaced: nothing previously stopped an
admin from setting a student's recurring 1:1 schedule directly on top
of a block — `/api/admin/recurring-schedule/route.ts` only ever
checked working hours. Added a check there (next occurrence overlaps
any `coach_blocks` row → 409) right next to the existing working-hours
gate. **Known remaining gap, deliberately not fixed here** — scope
call, not an oversight: `materializeRecurringSessions` itself still
doesn't check `coach_blocks` when generating future weeks for an
*already-existing* recurring schedule, so if a block is added after a
student's schedule already exists, sessions could keep generating
into it going forward. Fixing that touches the core session-generation
engine for every student, not just the new-block-at-set-time path —
worth a dedicated look, not a bolt-on to this feature.

Verified via `tsc`/`next build` (clean) and an interactive mock
(scratchpad) since no live login exists in this environment: the
add/all-coaches-toggle/stop interactions produce the exact right
request payloads, and the materialize math (re-implementing
`nextWeeklySlotInstant`) checked out for "Monday 10:30 ET" converted
correctly across ET/CT/MT/PT coaches.

## CSV import: added coach_since column (2026-08-28)

You asked whether "with coach since" (`coach_start_date_override`) needs
to be set at import time, same as "with us" (`student_since`, already
supported). It does: left unset, a migrated student's "with coach since"
auto-derives from their first session materialized in this app —
right after import — making a years-long coach relationship from the
old system look brand new.

Added `coach_since` as a 13th optional CSV column
([bulk-import-students/route.ts](app/api/admin/bulk-import-students/route.ts)),
`YYYY-MM-DD`, passed through to the new `coachStartDateOverride` field on
`provisionStudent()` ([lib/admin/provision-student.ts](lib/admin/provision-student.ts))
→ `students.coach_start_date_override`. Requires the `coach` column also
be set on that row (validated — a coach-relationship start date makes no
sense without a coach). Updated the column list, the downloadable
template, and the hint text in
[import-students-client.tsx](app/(admin)/admin/dashboard/import-students-client.tsx).
No migration needed — the column already existed (0029). `npx tsc
--noEmit -p .` and `next build` both clean.

## Wire remaining raw date/time displays to the global timezone selector (2026-08-28)

You reported the Group Lessons "Upcoming group lessons" list didn't
follow the global timezone switch, even though the calendar did.
Root cause: it used raw `new Date(x).toLocaleString()`, which reads
the *browser's* local zone, not the app's shared `useTimeZone()`
context ([components/formatted-time.tsx](components/formatted-time.tsx),
the intended drop-in for this everywhere). Audited the whole repo for
the same pattern (`grep -rln "toLocaleString\|toLocaleDateString"`) and
fixed every other genuine offender, not just the one reported:
[group-lessons-client.tsx](<app/(admin)/admin/group-lessons/group-lessons-client.tsx>)
(the reported one), 4 spots in
[all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>)
(Cancel/Book/Block modal headers + a credit-expiry `<option>`, which
can't hold a component so it uses `formatDateInZone` directly instead
of `<FormattedDateTime>`), 2 in
[finance-client.tsx](<app/(admin)/admin/finance/finance-client.tsx>),
and the coach dashboard's "with you since" month/year label in
[dashboard-client.tsx](<app/(coach)/coach/dashboard/dashboard-client.tsx>).

Left three call sites alone, deliberately:
- `components/coach-calendar.tsx` — already correct; it round-trips a
  timezone-already-resolved date *key* through the browser's own local
  zone symmetrically (construct-local, read-local), not a genuine
  instant, so it's zone-neutral by construction.
- `app/(student)/student/book/booking-client.tsx` — already passes
  `timeZone: timezone` from `useTimeZone()`, a false positive in the grep.
- `app/(admin)/admin/overview/page.tsx`'s "next session" time — already
  intentionally pinned to `DEFAULT_TIMEZONE` (Eastern) per its own
  header comment, citing TSS_App_Spec_1.md section 8's "admin's
  coach-schedule view is always normalized to Eastern" convention. Its
  *`todayLabel`* was an unintentional gap in that same convention (no
  timeZone at all, so it fell back to raw browser-local) — fixed that
  one to match the page's own stated Eastern-anchor rule, not switched
  to the global selector, so the page stays internally consistent with
  itself.

## Group lessons: series roster + remove registrations (2026-08-28)

Follow-up to the same-day "register for whole series" feature — you
pointed out there was no way to see who's registered across a series
(only per individual class), and no way to remove a registration at all.

`getRecurringSeriesRoster()` ([lib/group-lessons.ts](lib/group-lessons.ts))
collapses every future, non-cancelled occurrence's registrations to one
row per student (name + how many upcoming classes they're in) — same
occurrence-finding query as `registerStudentInRecurringSeries`, reused
rather than reinvented. New GET
[roster/route.ts](app/api/admin/group-lessons/roster/route.ts). Shown
directly under each Recurring Series card (`SeriesRegisterControl`,
[group-lessons-client.tsx](<app/(admin)/admin/group-lessons/group-lessons-client.tsx>))
— no click needed to see it, per your "it doesn't list the registrants"
note — with a "Remove from series" button per student.

Two removal paths, matching the two registration paths from earlier:
- **Whole series**: `unregisterStudentFromRecurringSeries()` deletes
  that student's `registered`-status rows across every future occurrence
  in one call. New DELETE on
  [register-series/route.ts](app/api/admin/group-lessons/register-series/route.ts).
- **Single class**: `unregisterStudentFromGroupLesson()` deletes one
  registration row. New DELETE on the existing
  [register/route.ts](app/api/admin/group-lessons/register/route.ts).
  A "Remove" link now sits next to each attendee on the individual
  "Upcoming Group Lessons" cards too.

Both are scoped to `status: "registered"` rows only — an `attended` or
`no-show` row is real history, and there's deliberately no UI path to
delete one (matches the existing soft-cancel posture from migration
0043, not a hard-delete-everything button). No migration needed — pure
application logic on the existing schema, admin's existing "for all"
policy on `group_lesson_registrations` already covers the deletes.
`npx tsc --noEmit -p .` and `next build` both clean.

## Fix Needs Review duplicating condition-driven items (2026-08-28)

You reported marking "Test Customer"/"Ambassador Test" resolved or
in-progress didn't remove them from Needs Action — instead the count
climbed to 42 duplicates of the same two students. Root cause:
`createIfNew()` in [attention-items.ts](lib/admin/attention-items.ts)
only checked `needs_action`/`in_progress` for an existing row, so
resolving a condition-driven item (like "inactive 10+ days") whose
condition is still true — true forever for a permanently-inactive test
account — let the very next page read recreate it, contradicting
migration 0035's own stated intent ("resolving it sticks... never
re-creates a duplicate"). The up-to-4 concurrent reads this page fires
per interaction compounded it, since the old check-then-insert had a
race window each of those could independently slip through.

[0062_fix_attention_items_duplication.sql](supabase/migrations/0062_fix_attention_items_duplication.sql)
collapses existing duplicates (keeping the most-progressed status per
student+kind, not a fresh dupe) and adds a partial unique index over
just the 6 condition-driven kinds — event-driven kinds like
`no_show_1/2/3` still legitimately recur, untouched. `createIfNew` now
upserts against that index with `ignoreDuplicates: true`, atomic under
concurrent reads instead of racy check-then-insert.

## Group lessons: register a student for a whole recurring series at once (2026-08-28)

You asked to keep the existing per-class Register button (drop-ins) but
also be able to register a student into an entire bootcamp series in one
action, instead of clicking Register on every single occurrence.

`registerStudentInRecurringSeries()`
([lib/group-lessons.ts](lib/group-lessons.ts)) queries every future,
non-cancelled `group_lessons` row for a series (same
`recurring_group_lesson_id` + future + not-cancelled filter
`updateRecurringGroupLessonSeries` already uses to find "this series'
occurrences" — reused rather than reinvented, and thrown, not swallowed,
on a read error, for the same reason that function's own comment gives:
a silently-empty read here previously caused the ~13-duplicate-row bug
migration 0056 fixed). Loops `registerStudentInGroupLesson` per
occurrence and buckets each outcome (registered / already-registered /
full / failed) rather than aborting the whole series over one occurrence
being full or a duplicate — same partial-success posture as the CSV
bulk-import route. New route:
[register-series/route.ts](app/api/admin/group-lessons/register-series/route.ts).
UI: a "Register for whole series…" link on each card in the Recurring
Series list ([group-lessons-client.tsx](<app/(admin)/admin/group-lessons/group-lessons-client.tsx>),
`SeriesRegisterControl`) that expands into the same
student-picker + Stripe-reference-field + Register shape the existing
per-occurrence card already uses, then shows a one-line summary ("6 of 6
registered" / "4 of 6, 2 full"). The existing per-occurrence Register
button on each individual "Upcoming Group Lessons" card is untouched.

No migration needed — pure application logic on the existing schema.
`npx tsc --noEmit -p .` and `next build` both clean.

## Multi-line credit grants, editable name/email (2026-08-28)

Replaced "Grant 4-pack" with N free-form lines, each its own
quantity + expiry date, one shared duration — e.g. 2 credits expiring
9/26 and 2 expiring 10/14 in one submit. Still calls
`/api/admin/add-credit` once per line (no batch endpoint needed, it
already takes a `quantity`); if a line fails partway through, the ones
that already succeeded are dropped from the form and the failing line
stays for a straight retry — no rollback attempted since those credits
are already real.
[add-credit-client.tsx](app/(admin)/admin/dashboard/add-credit-client.tsx)

Student name/email are now editable on the student detail page, same
click-to-edit pattern as birth date —
[name-client.tsx](<app/(admin)/admin/students/[studentId]/name-client.tsx>),
[email-client.tsx](<app/(admin)/admin/students/[studentId]/email-client.tsx>)
→ [set-student-info/route.ts](app/api/admin/set-student-info/route.ts).
Email doubles as the Kajabi webhook's match key — changing it here
doesn't touch Kajabi's own records.

## CSV import: download-template button instead of an inline column dump (2026-08-28)

You flagged the "Import students from CSV" panel's hint text as too much
raw column-list text to read live on the page. Replaced it with a short
one-line reminder of the two real gotchas (coach matching,
day_of_week/start_time pairing) plus a "Download CSV template" button
([import-students-client.tsx](app/(admin)/admin/dashboard/import-students-client.tsx))
that generates the same header-row-plus-example-row CSV client-side via a
`Blob` + temporary `<a download>` — no server round-trip, no new route.
`npx tsc --noEmit -p .` and `next build` both clean.

## One-go lesson setup on "Add ambassador / manual student" (2026-08-28)

You asked for the manual-provisioning form itself to set up a student's
lesson plan at creation — weekly, biweekly, or a 4-pack — instead of
adding basic info and then opening the new student's profile to set it
up as a second step. Added a "Lesson type" select
([provision-student-client.tsx](app/(admin)/admin/dashboard/provision-student-client.tsx):
"Not set yet" / Weekly / Biweekly / 4-pack) that reveals Day/Time/Starting
fields (weekly/biweekly) or a credit-expiry date (4-pack); left at "Not
set yet", behavior is identical to before this existed.

All of it happens inside the existing single POST to
`/api/admin/provision-student` — extended
[lib/admin/provision-student.ts](lib/admin/provision-student.ts)'s
`provisionStudent()` to validate the coach/day/time (weekly/biweekly) or
expiry (4-pack) **before** inserting the student row, so a foreseeable
input mistake never leaves a half-provisioned student behind. After a
successful insert it either creates the `recurring_schedules` row and
immediately materializes real sessions (same `materializeRecurringSessions`
call the dedicated recurring-schedule route uses), or inserts 4
`purchased-addon` `makeup_credits` rows — same shapes as
[recurring-schedule/route.ts](app/api/admin/recurring-schedule/route.ts)
and [add-credit/route.ts](app/api/admin/add-credit/route.ts) already use
elsewhere, just reached from one form instead of two. A secondary
DB-level failure at that point (student already real) logs rather than
rolling back, same posture this file already had for the Drive folder
and login-link steps.

Note: a concurrent session building CSV bulk-import landed its own
separate `lib/admin/create-recurring-schedule.ts` helper for the same
"set up a recurring schedule" need (see the entry below this one) — that
one is only used by the bulk-import route, this session's logic lives
inline in `provisionStudent()` for the single-add route, so there's no
collision, just two independent paths doing similar work. Worth
revisiting whether to consolidate later, not urgent.

`npx tsc --noEmit -p .` and `next build` both clean (after the
concurrent session's own in-progress `bulk-import-students/route.ts`
edit settled — hit one transient type error from that unrelated file
mid-session, resolved on its own, not touched here). Click-tested all
three lesson-type paths (weekly with/without a coach selected, 4-pack
with/without an expiry date) in the browser mock, including the
client-side validation blocking Add before it would even hit the
server-side checks.

## Ambassador tag, 4-pack credits, CSV bulk import (2026-08-28)

Three items off the onboarding backlog (biweekly cadence was already done by
a concurrent session — see the entry right below this one; this session
deliberately left that file's uncommitted work alone rather than risk
colliding with it, only adding the migration 0058 below it in sequence).

**Ambassador tag** — `students.ambassador` boolean (migration
[0058_student_ambassador_flag.sql](supabase/migrations/0058_student_ambassador_flag.sql)),
same no-new-RLS-needed posture as `coaches.active`/`referred_by_coach_id`.
Toggle lives on the student detail page
([ambassador-client.tsx](<app/(admin)/admin/students/[studentId]/ambassador-client.tsx>),
immediate-save checkbox, no financial consequence so no separate Save step
like [referral-client.tsx](<app/(admin)/admin/students/[studentId]/referral-client.tsx>)
needs) and as an explicit opt-in checkbox on the "Add ambassador / manual
student" form (defaults unchecked — that form also provisions Coach Tara's
non-ambassador Stripe students, so it can't default to true). Student
dashboard shows "Pro (Ambassador)" — a new short `SHORT_TIER_LABEL` map,
not the existing full `TIER_LABEL` ("Sing Smarter Pro"), per how the label
was specifically asked for.

**4-pack credit purchases** — admin-granted only, no checkout/payment
build. [add-credit/route.ts](app/api/admin/add-credit/route.ts) now takes
an optional `quantity` (1-10, default 1) and inserts that many
`purchased-addon` makeup-credit rows in one call; no migration needed,
the table was already generic. UI: a "Grant 4-pack" button next to the
existing "Add" button in
[add-credit-client.tsx](app/(admin)/admin/dashboard/add-credit-client.tsx).

**CSV bulk-import for students** — new admin panel on the Students
dashboard ([import-students-client.tsx](app/(admin)/admin/dashboard/import-students-client.tsx)
→ [bulk-import-students/route.ts](app/api/admin/bulk-import-students/route.ts)),
for onboarding many real students at once instead of one at a time.
Column schema: `name,email,tier,session_duration_minutes,coach,day_of_week,
start_time,frequency,ambassador,birth_date,billing_start_date,student_since`
— only name/email/tier required. `coach` resolves by exact email first,
else exact name restricted to active coaches (reports "not found" or
"ambiguous — use email instead" per row). The three date columns are
`YYYY-MM-DD`, all optional (validated with the same regex client- and
server-side) — `birth_date` and `billing_start_date` (overrides the
otherwise-default-to-today billing anchor) are plain passthroughs onto
existing columns; `student_since` is new (see below).
Two-phase: every row is validated up front and if ANY row fails, nothing
is created at all (cheap to fix the whole sheet and re-upload); once every
row passes, creation proceeds in batches of 5 and does NOT abort on a
single row's failure (a Drive-API hiccup on row 23 of 50 shouldn't discard
22 good rows — Supabase gives no real cross-row transaction here anyway),
returning a per-row created/failed report instead. Re-uploading the same
CSV afterward cleanly skips already-created rows at the duplicate-email
check. `maxDuration = 300` set on the route since each row does a DB
insert + Supabase Admin auth-user creation + Drive API call + email send.

Extracted two shared helpers so this doesn't duplicate the existing
single-add logic: [lib/admin/provision-student.ts](lib/admin/provision-student.ts)
(insert student → create auth user/profile → link → trial entitlement for
Suite → Drive folder → login email — now also used by
[provision-student/route.ts](app/api/admin/provision-student/route.ts))
and [lib/admin/create-recurring-schedule.ts](lib/admin/create-recurring-schedule.ts)
(working-hours-validated upsert + materialize — a copy of the logic in
[recurring-schedule/route.ts](app/api/admin/recurring-schedule/route.ts),
kept as a copy rather than refactoring that route to call it, since the
concurrent biweekly-cadence session had that exact file open — the copy's
`cadence` handling is kept byte-for-byte identical to avoid drift).
`lib/admin/parse-csv.ts` is a small hand-rolled parser (quoted-field
support) rather than a new dependency — no CSV library was already in
`package.json` and the project keeps its dependency footprint minimal.

**Follow-up same day: billing start date, birthday, and a new "student
since" override**, all now settable at CSV-import time (and the first
two were already admin-editable post-creation; the third is brand new).
New `students.student_since_override` date column (migration
[0059_student_since_override.sql](supabase/migrations/0059_student_since_override.sql)),
same override/fallback pattern as `coach_start_date_override` — blank
falls back to the row's own `created_at`. The student detail page's
"With us" row (previously a plain, non-editable
`formatTenure(student.created_at)`) is now
[student-since-client.tsx](<app/(admin)/admin/students/[studentId]/student-since-client.tsx>)
→ [set-student-since/route.ts](app/api/admin/set-student-since/route.ts),
same click-to-edit-with-clear-override shape as
[coach-start-date-client.tsx](<app/(admin)/admin/students/[studentId]/coach-start-date-client.tsx>).
`provisionStudent()` gained `birthDate`/`billingAnniversaryDate`/
`studentSinceOverride` passthrough fields — note `lib/admin/provision-student.ts`
and `app/api/admin/provision-student/route.ts` were, in the same window,
being actively extended by the concurrent session above (one-go
lesson/4-pack setup on the manual-add form) — these three fields were
merged in alongside that work rather than written against a stale copy;
re-read both files immediately before each edit to confirm.

`npx tsc --noEmit -p .` and `next build` both clean (the first `next
build` attempt hit a spurious `ENOENT` renaming `.next/export/500.html`
— caused by a dev server also writing to the same `.next/` directory at
the same time, not a real bug; stopping the dev server and rebuilding
was clean). Re-verified interaction logic in the same click-tested mock
— valid dates on all three columns pass, a malformed `birth_date` like
`04/02/1998` is rejected with an explicit "must be YYYY-MM-DD" message,
and blank dates behave as before. Mock link unchanged (redeployed same
artifact):
https://claude.ai/code/artifact/2a71bb7e-0a3e-4f0b-8b96-0a2637de0388 Verified interaction
logic (not the real DB/Drive/email calls, which need a real login this
project can't test against) by copying the same validation code into a
click-tested mock — coach-email/name resolution, ambiguous-name rejection,
duplicate-email-in-CSV rejection, missing/invalid field rejection, and the
ambassador-toggle-updates-dashboard-label live behavior all confirmed
working as designed. Mock published:
https://claude.ai/code/artifact/2a71bb7e-0a3e-4f0b-8b96-0a2637de0388

Still needed from you: manually test the recording-added-to-folder and
folder-per-student flows against a real student (no automated pipeline
exists for either — recordings are just files placed in Drive by hand),
and a full click-through of student/coach/admin dashboards once real
student data is loaded, per the onboarding backlog.

## Biweekly recurring schedule for exception students (2026-08-28)

A handful of students are being kept on via an off-the-books, Stripe-billed
arrangement: Sing Smarter Suite tier plus a manually-arranged biweekly
lesson slot — not a Kajabi offer, admin-only, not to be advertised. Added
a `cadence` field to `recurring_schedules` (`weekly`/`biweekly`,
[0057_recurring_schedule_cadence.sql](supabase/migrations/0057_recurring_schedule_cadence.sql))
so admin can now set a student's regular slot to fire every other week
instead of building a second scheduling mechanism from scratch.

Cap is calendar-month anchored, not billing-cycle anchored like the
existing weekly "5th occurrence, week off" cap — a biweekly schedule
always lands on the month's 1st and 3rd occurrence of that weekday
(`monthOccurrenceNumber` in
[lib/scheduling/recurring.ts](lib/scheduling/recurring.ts)), so a 5-week
month yields exactly 2 sessions, not 3, regardless of the student's own
billing anniversary date.

Also fixed a real (if minor) side effect: the coach/student dashboards'
"Sessions this cycle: X of 4 used" was a flat hardcoded `4` gated only on
`tier === "suite"` — would've shown a misleading "2 of 4 used" for a
biweekly student who's actually fully booked. Added
`effectiveSessionCycleCap(tier, cadence)` as the one shared source of
truth for both
[lib/coach/dashboard-data.ts](lib/coach/dashboard-data.ts) and
[app/(student)/student/dashboard/page.tsx](<app/(student)/student/dashboard/page.tsx>),
which weren't sharing this logic with each other before.

Admin UI: new Weekly/Biweekly selector on the recurring-schedule form
([recurring-schedule-client.tsx](<app/(admin)/admin/students/[studentId]/recurring-schedule-client.tsx>)),
summary label shows "— biweekly" when set.

Also made the Membership badge on the student detail page itself
editable ([membership-tier-client.tsx](<app/(admin)/admin/students/[studentId]/membership-tier-client.tsx>),
[/api/admin/set-tier](app/api/admin/set-tier/route.ts)) — same
click-to-edit shape as the existing Referred-by field, plus the
"(Biweekly)" suffix when the student's schedule is biweekly. Editing
tier pops a native confirm first (`window.confirm`, "this overwrites
what Kajabi has on file...") since `tier` is otherwise only ever written
by the Kajabi webhook's `purchase.created` handler — confirmed that
handler does a blind `upsert`, so it isn't blocked by this override and
will freely overwrite it again on the student's next real
upgrade/downgrade in Kajabi, same as before this override existed. No
webhook changes needed.

`npx tsc --noEmit -p .` and `next build` both clean. Traced the
month-occurrence math against a known 5-Friday month (October 2027:
Fridays on 1/8/15/22/29) — confirmed only the 1st and 15th are kept, the
rest correctly skipped. Click-tested the Membership edit/confirm/cancel
flow and the live "(Biweekly)" suffix toggle in the browser mock.

## Group lessons never displayed anywhere: RLS policy recursion (2026-08-28)

Root cause of "the bootcamp doesn't show on the coach calendar", found
only after several wrong turns — worth reading before touching group
lessons again.

**The bug:** migration 0031's policies are mutually recursive.
`group_lessons`' student policy subqueries `group_lesson_registrations`,
and that table's coach policies subquery `group_lessons`. Postgres
aborts any RLS-scoped read of *either* table with `42P17: infinite
recursion detected in policy for relation "group_lesson_registrations"`.
This is precisely the cycle migration 0007 was written to eliminate,
reintroduced. Fixed in **migration 0056** with the same SECURITY
DEFINER helper pattern 0007 established (`auth_student_group_lesson_ids()`,
`auth_coach_group_lesson_ids()`).

**Why it hid for so long, and why it wasted a lot of this session:** an
INSERT only evaluates `WITH CHECK` (`is_admin()`, non-recursive), so
admin *writes* kept succeeding while every *read* errored — and every
caller discarded the error (`const { data } = await ...`, no error
check), so a failed query was indistinguishable from "nothing
scheduled". Three separate symptoms all traced back to this one cause:
group lessons never appearing on any coach/admin calendar, the admin
"Upcoming group lessons" list staying empty, and
`updateRecurringGroupLessonSeries`' "delete the empty future
occurrences" step reading zero rows and deleting nothing — which let a
single occurrence accumulate ~13 duplicate rows across repeated saves.

**Two calendar-rendering fixes were also real and are kept**, but
neither was the cause and neither would have helped alone: the grid's
row range only spanned working hours (a lesson outside them had no row
to render into), and `cellState` returned "blank" for any cell outside
working hours *before* ever checking for a group lesson. Group lessons
are deliberately not constrained to a coach's working hours, unlike 1:1
recurring slots (`slotFitsWorkingHours`), so both were genuine.

**Process note:** the thing that finally cracked it was a read-only
script querying production directly with the service-role key from
`.env.local`, instead of another round of deploy-and-look. Service role
bypasses RLS, so comparing it against an anon-key read is what surfaced
the 42P17 error the app had been swallowing. Worth reaching for that
much earlier next time a "the data is there but nothing renders" bug
appears.

Also hardened: `getCoachGroupLessons` now logs its error instead of
discarding it, and the delete-then-regenerate step throws rather than
silently duplicating.

Migration 0056 confirmed live — re-ran the anon-vs-service-role RLS
probe after you applied it, recursion is gone and nested embeds
resolve cleanly. Cleanup done too: verified a delete plan against
production first (36 rows, nothing with a registration, nothing a
one-off, keep-earliest-per-occurrence for the active series, drop all
of a stopped series' leftovers), previewed it, you approved, applied
it — 34 deleted, 2 real occurrences left (Sep 5 and Sep 12, both
BOOTCAMP C1, 19:00 UTC = 15:00 ET, the active series' actual time —
not 16:00, which was a since-superseded series). Confirmed via a
follow-up SELECT.

## Studio holidays: fixed the actual visible bug — empty slots weren't blocked (2026-08-28)

You caught the real remaining gap live: Nov 26 (Thanksgiving) still
showed as plain "Available" (clickable, "Click to book with a makeup
credit") on Celine's Week view, not blocked. Root cause — every backend
piece from the two entries above was correct (booking APIs reject it,
recurring generation skips it, an already-forfeited session shows
"Studio holiday — held"), but the **coach calendar's own empty-slot
color** is computed entirely client-side by a `cellState()` function in
both [components/coach-calendar.tsx](components/coach-calendar.tsx) and
[all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>)
— from working hours + coach_blocks + existing sessions — and neither
had ever been told about `studio_holidays` at all. A day with nothing
already scheduled on it just fell through to plain "Available."

- Both components now fetch `/api/admin/studio-holidays` once on mount
  (already RLS-readable by any authenticated user, no new endpoint
  needed) and check `isHolidayInstant()` as the very last fallback in
  `cellState()`, right before "available" — deliberately placed *after*
  every other check (session/group-lesson/held/block), so a real
  forfeited session's own "Studio holiday — held" rendering is
  untouched; this only fires for a slot nothing else already claimed.
- Reuses the existing solid "Blocked" rendering (same color as a coach's
  own time-off block) by synthesizing a `Block`-shaped object with just
  a `reason` string (`"Studio holiday — Thanksgiving Day"`) — no new
  visual state, no new legend entry, and for free: a "block" cell was
  already non-clickable in both components' existing click logic, so
  this closes the actual "still not blocked" complaint (nothing to book
  there) without touching any click-handling code at all.
- `npx tsc --noEmit -p .` and `next build` both clean. Visually
  confirmed in a mock reproducing the exact Week-view layout from your
  screenshot: Thu 26 renders as a solid black closure with "Studio
  holiday — Thanksgiving Day" on its first row, every other day stays
  normal "Available" shading:
  [holiday grid fix preview](https://claude.ai/code/artifact/694365e8-edf7-46ab-8246-82ba8778f2c2).

## Studio holidays correction: dates are Florida time, not per-coach zone (2026-08-28)

You caught this right after the feature above shipped: the studio itself
is in Florida, so "closed Dec 25" means Dec 25 midnight-to-midnight
*there* — not each coach's own local day. My first pass had every
holiday check resolving in whichever timezone the affected coach was
in, following the same "resolve in the coach's own zone" convention this
codebase uses everywhere else (working hours, recurring occurrences) —
wrong for this one specific case, since a holiday is a fixed studio-wide
policy anchored to one place, not per-coach.

- New `isHolidayInstant()` in [lib/scheduling/holidays.ts](lib/scheduling/holidays.ts) —
  resolves any instant against `DEFAULT_TIMEZONE`
  (`America/New_York`, Florida's own zone — already this app's
  studio-wide fallback elsewhere) unconditionally, replacing the old
  per-coach `dateKeyInZone()`.
- `forfeitHolidaySessions()` simplified — no longer needs to join coach
  timezones at all, just checks every candidate session/group-lesson
  against the one fixed zone.
- `occurrencesFor()` (lib/scheduling/recurring.ts) — the holiday check
  moved to *after* the occurrence's real UTC instant is computed, checked
  via `isHolidayInstant`, instead of comparing the coach-zone-walked
  calendar date directly against the holiday set.
- [booking/book/route.ts](app/api/booking/book/route.ts) — dropped the
  coach-timezone fetch entirely, checks the requested slot's instant
  against Florida directly.
- [booking/slots/route.ts](app/api/booking/slots/route.ts) — the
  holiday check moved from the coach-zone day-walk level down to each
  candidate slot's actual instant, since a coach-zone calendar day and
  Florida's calendar day aren't the same window for a coach outside
  Eastern — e.g. a California coach's late-evening slot can already be
  the *next* Florida calendar day.
- Real, if edge-case, consequence worth knowing: for a coach in an
  earlier zone (Pacific), a slot late enough in their own evening can
  now be blocked as "the next day's Florida holiday" even though it's
  still the prior calendar date for them locally — exactly what you
  described (Florida's clock governs, full stop), not a bug.
- `npx tsc --noEmit -p .` and `next build` both clean. No new mock — same
  feature, just correcting which timezone anchors it; the studio
  holidays preview from the entry above is unaffected (it never modeled
  multi-timezone behavior, so nothing there needed to change).

## Studio holidays: full-closure dates, auto-forfeit, no makeup (2026-08-28)

You gave the studio's 2026 official holiday list and asked to guarantee
nobody's scheduled on those dates, with any existing session on one
auto-forfeited and no makeup credit issued. This is a real, admin-
managed feature now, not a one-off — you flagged yourself that Easter/
Thanksgiving shift every year, so a hardcoded date list would go stale;
built a proper `studio_holidays` table + admin UI instead.

**New migration [0055_studio_holidays.sql](supabase/migrations/0055_studio_holidays.sql)**
— **confirmed applied 2026-08-28**:
- `studio_holidays` table (`date` unique, `label`), admin-manage RLS
  (`is_admin()`, both `admin`/`admin_finance`) + read for any
  authenticated user. Seeded with all 7 dates you gave, for 2026
  specifically (Jan 1, Apr 5 Easter, Jul 4, Nov 26 Thanksgiving, Dec 24,
  Dec 25, Dec 31) — next year's Easter/Thanksgiving need re-adding via
  the new admin panel, they don't auto-shift.
- Widens `sessions_status_check` to add a new **`'holiday'`** status —
  deliberately its own value, not reusing `cancelled-no-notice` or
  `paused`: same "held, grey, no attendance" display treatment as both,
  but unlike `cancelled-no-notice` it's **not** a paid status (studio's
  closed, nobody's working, so `lib/payroll/calculate.ts`'s
  `PAID_STATUSES` simply omits it — no coach compensation), and unlike
  `paused` it's a permanent single-date forfeit, not a resumable window.
  **No makeup credit is ever granted or reinstated for it** — a
  dedicated forfeit path, not `lib/booking/cancel-session.ts`'s normal
  cancellation flow, which always would grant or reinstate one.

**New [lib/scheduling/holidays.ts](lib/scheduling/holidays.ts)** — shared
by everything below:
- `getHolidayDateKeys()` — the studio_holidays date set, fetched fresh
  each call (cheap, one small table).
- `forfeitHolidaySessions()` — the retroactive sweep. Finds every
  `'scheduled'` session and non-cancelled group lesson landing on a
  holiday date (matched in **the coach's own timezone**, same as every
  other "which day is this" decision in this app — not a bare UTC date
  slice), flips sessions to `status: 'holiday'` and sets group lessons'
  `cancelled_at`. Touches `makeup_credits` **not at all** — "no makeup"
  means exactly that. Idempotent (only ever matches not-yet-forfeited
  rows), so safe to run on every cron tick forever.

**Prevented going forward, four places**:
- `lib/scheduling/recurring.ts`'s `occurrencesFor()` — a holiday date is
  never even offered a session to skip, same treatment as the existing
  "5th Wednesday" billing-cap skip. `materializeRecurringSessions()` and
  `getHeldRecurringSlots()` (the paused-slot display/blocking helper)
  both fetch the holiday set once and pass it through.
- [lib/group-lessons.ts](lib/group-lessons.ts)'s
  `materializeRecurringGroupLessons()` — same filter, recurring group
  series never generate onto a holiday either.
- [app/api/booking/slots/route.ts](app/api/booking/slots/route.ts) — a
  holiday date shows zero bookable slots for any coach, full stop.
- [app/api/booking/book/route.ts](app/api/booking/book/route.ts) — hard
  409 reject if the requested slot's date (coach's zone) is a holiday.
  **No admin override** — "make sure no one is scheduled" means no
  exceptions; if a real exception is ever needed, remove that date from
  the list instead.

**Wired into the existing daily cron** —
[materialize-recurring/route.ts](app/api/cron/materialize-recurring/route.ts)
now runs `forfeitHolidaySessions()` right after the pause auto-resume
step and before materializing new occurrences, so the very next nightly
run both cleans up anything already sitting on these dates *and* stops
new occurrences from ever landing there again, with zero manual
intervention.

**New "Studio holidays" admin panel**, Coaches tab (next to "+ Add
coach") — new
[app/api/admin/studio-holidays/route.ts](app/api/admin/studio-holidays/route.ts)
(GET/POST/DELETE, `isAdminRole`-gated — this is scheduling policy, not
money) and `StudioHolidaysPanel` in
[all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>):
lists every holiday with a Remove link, plus an add form (date + optional
label). This is the actual answer to "how do I add next year's Easter" —
a real UI, not a Supabase-only list.

**Every existing "held" display/exclusion spot updated to also cover
`'holiday'`**, mirroring exactly how `paused` was rolled out (grepped
every `cancelled-no-notice`/`paused` reference, not guessed): coach
calendar (both admin all-coaches and per-coach views, including the
Month-view day summary that feeds the "N session(s)" badge), coach
dashboard's dot/label/mark-eligibility helpers, and every cycle-cap /
"active sessions" exclusion query (student dashboard, coach dashboard,
admin overview, reassign-coach). Deliberately **left out** of
`lib/payroll/calculate.ts`'s `PAID_STATUSES` (unpaid, by design) and
`lib/admin/attention-items.ts`'s `MISS_STATUSES` (not the student's or
coach's fault, shouldn't trigger a no-show/late-cancel streak).

`npx tsc --noEmit -p .` and `next build` both clean throughout. Click-
tested in a mock: all 7 seeded holidays listed, added and removed one,
a session on Nov 26 rendering as "Studio holiday — Mimi Test" (held,
grey), and a booking attempt on that date returning the 409 rejection
message:
[studio holidays preview](https://claude.ai/code/artifact/2a07b1b1-3eaa-4743-ad41-e7a02addcb7a).

## Recurring sessions: extended the generation horizon from ~2 months to a year (2026-08-28)

Follow-up to the November-is-blank question — you asked to make it
effectively indefinite (until cancelled) instead of stopping after ~2
months. That "stops after 2 months" look was purely
`WEEKS_AHEAD` in [lib/scheduling/recurring.ts](lib/scheduling/recurring.ts) —
a recurring schedule already runs forever in practice (the daily
`materialize-recurring` cron slides the horizon one more day out every
day it runs, with no end, until you change/remove the schedule or the
student's subscription gets cancelled/paused — both of those already
stop generation past their own effective date). `WEEKS_AHEAD` is just
how much runway sits pre-generated as real `sessions` rows at any given
moment, not a cap on the booking's lifetime — there's no such thing as a
literal unbounded lookahead for a materialized-row model, since there's
no "last" occurrence to stop at.

- Bumped `WEEKS_AHEAD` from 8 (~2 months) to **52 (a full year)** — long
  enough that nobody should ever see an artificial-looking gap like
  November's again, without generating an unreasonable number of rows
  for students who change their schedule long before most of them would
  ever be used. Shared by both individual recurring schedules and
  [recurring group lessons](lib/group-lessons.ts) (this session's other
  work), so both get the same extended runway.
- **Takes effect on the next `materialize-recurring` cron run, not
  gradually** — `occurrencesFor` always recomputes the full window from
  "now" out to `WEEKS_AHEAD` weeks every time it runs, then only inserts
  whatever's missing; it doesn't build on the previous horizon
  incrementally. So the very next daily cron run (or immediately, if you
  edit a schedule or billing anchor for a specific student, which also
  calls this) fills the entire gap between the old ~2-month horizon and
  the new 1-year one in one pass — you don't need to wait months for the
  buffer to naturally extend.
- `npx tsc --noEmit -p .` and `next build` both clean. No mock for this
  one — it's a single constant with well-defined, already-verified
  arithmetic (same `occurrencesFor`/cap logic exercised in the billing-
  anchor mock above), nothing new to click-test; the real proof is
  November (and beyond) populating with sessions after the next cron
  run.

## Editable billing cycle anchor, and correcting an earlier explanation (2026-08-27)

Follow-up to the "why did Sep 16 skip" question — you asked how to set
the billing cycle anchor since you'd expect it to be right. Two things
came out of digging in:

**Correction to what I said earlier**: I'd attributed both the Sep 16
*and* Oct 28 gaps to the same "5th Wednesday, cycle cap" mechanism. That
was wrong for Oct 28 — actually ran `lib/scheduling/recurring.ts`'s exact
`cycleOccurrenceNumber` math (not a guess) against Celine's real
Wednesdays, and no single anchor date produces two skips that close
together; the math only supports one. **Sep 16 is a genuine cap-driven
skip** (the cycle's 5th same-weekday occurrence, per whatever
`billing_anniversary_date` day-of-month was auto-assigned to this
student). **Oct 28 (and November) is unrelated — it's simply past the
8-week `WEEKS_AHEAD` generation horizon**, same as before; no anchor
value affects that, it fills in on its own as the daily cron's horizon
advances.

**Built what you actually asked for — an editable billing cycle
anchor**, since there was genuinely no way to set/correct
`students.billing_anniversary_date` anywhere before now (only
ever auto-set to "today" at provisioning/Kajabi-webhook/backfill time,
per `app/api/admin/provision-student/route.ts`,
`app/api/webhooks/kajabi/route.ts`, and the recurring-schedule route's
own backfill — never admin-editable). Matters for real students where
that auto-assigned date doesn't match their actual invoice/billing date,
which is exactly what determines which week is the legitimate "week
off."

- New [app/api/admin/set-billing-anniversary/route.ts](app/api/admin/set-billing-anniversary/route.ts) —
  updates `billing_anniversary_date`, same RLS-only posture as
  `set-birth-date`/`set-referral` (0007's "admins can update all
  students"). Then, since a changed anchor can retroactively make an
  already-materialized future session wrong either way (a real session
  that should now be a skip week, or a skip week that should now be a
  real session) — and `materializeRecurringSessions` only ever fills in
  what's missing, it never removes what no longer belongs — this route
  deletes the student's own recurring-schedule-tied future `scheduled`
  sessions and regenerates them under the corrected anchor immediately,
  same delete-then-regenerate approach `recurring-schedule`'s own POST
  route uses when the day/time itself changes. (Benefits from
  migration 0054 above — this delete was silently broken the same way
  until that policy existed.)
- New [billing-anniversary-client.tsx](<app/(admin)/admin/students/[studentId]/billing-anniversary-client.tsx>) —
  same click-to-edit pattern as Birthday, new "Billing cycle anchor" row
  on the student detail page right after "With us".
  [page.tsx](<app/(admin)/admin/students/[studentId]/page.tsx>) already
  selected `billing_anniversary_date` (used for the renewal-date
  display), so no new query needed.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested by
  porting the exact `cycleOccurrenceNumber` algorithm into a mock and
  running it against Celine's real Sep/Oct 2026 Wednesdays: reproduced
  the Sep 16 skip exactly with a day-18 anchor, then edited the anchor
  to day-3 and confirmed the skip week moved to Sep 2 — proving the fix
  actually re-derives the right week, not just accepting any date:
  [billing cycle anchor preview](https://claude.ai/code/artifact/0b05f9d4-64d0-4736-b6fc-db372d377bea).

## Root cause found: recurring-schedule changes leave duplicate sessions (2026-08-27)

You caught this live testing Mimi Test's recurring schedule: change the
weekly slot, change it again, and the old day's session never actually
disappears — both a Wed 2:30pm and a Thu 4:00pm "Mimi Test" ended up
sitting on Celine's coach calendar at once. Real backend bug, not a UI
glitch:

**`sessions` has never had a DELETE policy, for any role.** Grepped
every migration — SELECT/INSERT/UPDATE policies exist for admin/coach/
student (0003/0005/0007/0010/0012/0017), but no DELETE, ever. RLS
defaults to *deny* when nothing matches, so
[app/api/admin/recurring-schedule/route.ts](app/api/admin/recurring-schedule/route.ts)'s
cleanup step — "delete this schedule's own future `scheduled` sessions
before regenerating for the new day/time" — has been silently affecting
**zero rows** every single time, on both the POST (change schedule) and
DELETE (remove schedule entirely) handlers. Supabase's client doesn't
surface an RLS-blocked delete as an error (the exact same gotcha
migration 0041's own comment already flagged for UPDATE, and why
`coach-active`/`coach-info`/`coach-links` all defensively check affected
rows) — this delete call had no such check, so the no-op passed
completely silently. Old occurrences of every past schedule change have
been quietly accumulating instead of being replaced ever since this
feature shipped.

- New [0054_admin_delete_sessions.sql](supabase/migrations/0054_admin_delete_sessions.sql) —
  adds `"admins can delete sessions"` (`is_admin()`), mirroring the
  existing admin SELECT/INSERT/UPDATE policies on the same table.
  **Not yet confirmed applied** — see Action needed below.
- Both delete call sites in
  [recurring-schedule/route.ts](app/api/admin/recurring-schedule/route.ts)
  now check the delete's own `error` and fail loudly (500) instead of
  swallowing it — doesn't turn "zero rows" into an error (that's
  legitimately normal, e.g. a brand-new schedule with nothing generated
  yet), but a genuine future RLS/policy regression won't go silent again.
- **Not fixed by this migration alone: Mimi Test's existing stray
  duplicate session(s) already in the database.** The policy fix
  prevents this from happening on the *next* schedule change — it
  doesn't retroactively clean up sessions that already leaked through
  while the policy was missing. You'll need to manually cancel/remove
  the extra "Mimi Test" occurrence from the Coaches day/week view (the
  existing staff-cancel action) once you've confirmed which one should
  stay.
- `npx tsc --noEmit -p .` and `next build` both clean. **Not click-tested
  against real Supabase** — this is a pure RLS/backend fix with no
  observable UI difference to mock; the real proof is you retrying the
  same change → change-back sequence live once 0054 is applied and
  confirming only one session survives each time.

## Meeting link: fixed staleness bug, added coach-side display (2026-08-27)

You caught a real bug live: editing the meeting link inline in the
roster (`CoachLinkCell`'s own "Edit" next to the link, separate from the
full Edit-coach modal) then reopening the Edit-coach modal for the same
coach still showed the *old* link. Root cause — `CoachLinkCell`'s
`handleSave` only updated its own local `saved` state after a
successful POST; it never called `router.refresh()`, so the page's
server-fetched `coaches` array (which is exactly what feeds the
Edit-coach modal's initial values when you click that row's other
"Edit") stayed stale until a full reload. `EditCoachPanel` and
`AddCoachPanel` already refreshed correctly on save — this one inline
quick-editor was the only path that didn't. Fixed by adding
`router.refresh()` there too, matching the other two.

**Also, real gap you flagged: the coach's own dashboard never showed
their meeting link at all** — only the student side did (via
`JoinButton`). Added a small "Open my meeting room →" link to the coach
dashboard hero (next to "You have N sessions today"), reading the same
`coaches.meet_link` column:
[app/(coach)/coach/dashboard/page.tsx](<app/(coach)/coach/dashboard/page.tsx>)
now selects `meet_link` and passes it to
[dashboard-client.tsx](<app/(coach)/coach/dashboard/dashboard-client.tsx>).
Unlike the student's `JoinButton` (which only appears 10 minutes before
a specific session and links that session), this is the coach's one
persistent room link, always visible when set — no time-gating, since
it's the same link every session.

The student side needed no code change — `student/dashboard/page.tsx`
already selects `meet_link` fresh on every server render, so it was
already correct once the coach-side data itself was correct; the bug
was purely the admin-side staleness above.

`npx tsc --noEmit -p .` and `next build` both clean. Click-tested in a
mock: inline-edited the link, confirmed the coach-dashboard link and
student join link updated immediately, then reopened the Edit-coach
modal and confirmed it showed the fresh value (not the stale one) —
exactly reproducing and then fixing what you saw live:
[meeting link sync preview](https://claude.ai/code/artifact/de1bb6fb-062b-4629-8739-bc5d604c86d5).

## Edit Coach: same all-in-one treatment as Add Coach (2026-08-27)

Immediate follow-up to Add Coach above — you asked for the same "edit
everything in one go" on the existing `EditCoachPanel`, which previously
covered only name/email/timezone/visibility. Now also includes meeting
link and the full weekly availability grid.

- `EditCoachPanel` gained a Meeting link field and a `WorkingHoursGrid`
  (the same shared component Add Coach uses), pre-filled from the
  coach's live `meet_link`/`working_hours`. **Deliberately does not
  include `hourly_rate`** — that field has its own access boundary
  (`hasFinanceRole`, Finance-tab-only) for a real reason, and this modal
  is `isAdminRole` (both `admin` and `admin_finance`); folding pay rate
  in here would quietly undo that boundary for a plain `admin`.
- **Save now fires 3 requests in parallel**: `coach-info` (name/email/
  timezone/visibility), `coach-links` (meeting link), and
  `coach-working-hours` (availability) — first failure surfaces its
  error, matching the same all-or-partial-visibility tradeoff Add Coach's
  single request doesn't have to make (Add Coach bundles everything into
  one `provision-coach` insert instead).
- **Availability here is intentionally simpler than the dedicated
  Availability panel** — no effective-date field, always saves
  immediately. If a change is already queued (`pending_effective_date`
  set), the modal shows a warning that saving here applies the new hours
  *now* and cancels that scheduled change — reusing
  `coach-working-hours`'s existing documented behavior ("an immediate
  save supersedes a pending one") rather than adding new backend logic.
  The dedicated Availability panel (opened from the day-schedule column
  header) remains the way to queue a future-dated change.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested in
  the refreshed mock: meeting link and all working-hours windows
  pre-filled correctly on open, the pending-change warning showed with
  the right date, adding a window and saving cleared
  `pendingEffectiveDate` back to null (matching the real route):
  [edit coach info preview](https://claude.ai/code/artifact/d178fe14-aed4-4d1f-b8bf-7c817f6220f2).

## Add Coach: meeting link, visibility, and availability all in one form (2026-08-27)

You asked to set everything about a new coach in one go, rather than
Add coach → Availability panel → CoachLinkCell edit as three separate
steps. `AddCoachPanel` in
[all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>)
now also has a Meeting link field, a "Hidden from trial picker"
checkbox, and a full weekly Availability grid — same day-by-window
picker `AvailabilityPanel` already used.

- **Extracted `WorkingHoursGrid`** — the day-by-window UI (add/remove/
  edit a time window per day) used to live inline inside
  `AvailabilityPanel` only; pulled out into its own component taking
  `hours`/`setHours` so both `AvailabilityPanel` (editing an existing
  coach) and the new `AddCoachPanel` section (setting initial hours) share
  one implementation instead of two copies. New `emptyWorkingHours()`
  gives the Add-coach form's grid its starting all-days-off state.
- [provision-coach/route.ts](app/api/admin/provision-coach/route.ts) now
  accepts optional `meetLink`, `hiddenFromStudents`, and `workingHours` in
  the insert — all still optional/backward-compatible (defaults match
  the old behavior: `{}`, `null`, `false`) in case anything else ever
  calls this route directly.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested in a
  focused mock: filled name/email/rate/meeting-link, added a Monday
  9–5 window, submitted, and confirmed the assembled payload matched the
  real route's expected body shape exactly:
  [add coach all-in-one preview](https://claude.ai/code/artifact/efdd7c42-e68b-4216-bb40-be935128a6b1).

**Related question you asked, answered by reading the actual code (not
assumed):** a newly added coach *does* get automatic working access —
`provision-coach` already creates their Supabase auth user, a `profiles`
row (`role: "coach"`), links `profile_id`, and emails them a magic-link
straight to `/coach/dashboard`. Nothing needed to change there.

**Follow-up you also asked about, and this one *was* a real gap:**
removing a coach (`active = false`) only ever hid them from new
bookings/scheduling — [resolve-account.ts](lib/auth/resolve-account.ts)'s
coach lookup (used by both the login-code request and verify steps)
matched on email alone, so a removed coach could still request a code
and log straight into `/coach/dashboard`. You confirmed you want login
blocked too, so the coach lookup now also requires `active`, matching a
never-registered email's behavior (same generic "you don't have
permission" message, no separate wording needed). **Known limitation,
not fixed here:** this only blocks *new* logins — a coach already mid-
session with a valid cookie when removed isn't forcibly signed out; that
would need active session revocation, a bigger change nobody asked for
yet.

## Student dashboard: de-duplicated homework notes, coach chat labels (2026-08-27)

Found while click-testing the student dashboard live: two small,
unrelated bugs.

- **"Homework Notes" was rendered twice** —
  [student/dashboard/page.tsx](<app/(student)/student/dashboard/page.tsx>)
  had both a cursive "spotlight" card (the latest note,
  `spotlightNotes[0]`) near the top, *and* a full "Homework notes"
  heading + `<NotesPanel>` list directly above Chat that repeated the
  same entries. Per your ask, removed the one above Chat (the heading +
  `NotesPanel` block) and kept the spotlight card as the single
  homework-notes surface on this page; the now-unused `NotesPanel` import
  removed too.
- **Coach chat messages read "{name} (coach)", not "Coach {name}".**
  [app/api/chat/messages/route.ts](app/api/chat/messages/route.ts)'s
  `GET` builds a `participants` map used to label every non-mine chat
  bubble ([chat-panel.tsx](components/chat-panel.tsx)) — coach senders
  now resolve to `Coach {firstName}` (e.g. "Coach Tara", "Coach Celine"),
  matching the "Coach {firstName}" phrasing already used elsewhere on
  this same page (`Chat with Coach {coachFirstName}`, etc.). Admin
  senders are untouched (still label "Admin"); this is one shared route
  used by every `ChatPanel` instance (student dashboard, `/student/chat`,
  coach's own chat, admin's student-detail chat), so the fix applies
  everywhere at once, not just the dashboard.
- `npx tsc --noEmit -p .` and `next build` both clean. Visually verified
  in a mock (spotlight note only, no duplicate list; "Coach Tara" and
  "Admin" bubbles distinct, student's own reply right-aligned with no
  label):
  [dashboard chat fixes preview](https://claude.ai/code/artifact/4cc3ef21-476a-412a-8552-27c05096de5d).

## Coaches tab: edit a coach's name/email/timezone/visibility (2026-08-27)

You asked for full coach-info editing — name, email, etc. Turned out
those four fields (name, email, timezone, `hidden_from_students`) had
*never* been editable after `AddCoachPanel` first created the row:
hourly_rate (Finance), working_hours (Availability), active (Remove/
Reactivate), and meet_link (this session's earlier `CoachLinkCell`) all
already had their own edit paths, these four didn't.

- New [app/api/admin/coach-info/route.ts](app/api/admin/coach-info/route.ts) —
  updates `name`/`email`/`timezone`/`hidden_from_students`. `isAdminRole`-
  gated like `coach-links` (not money). Returns a clear 409 ("Another
  coach already uses that email.") on the `coaches.email` unique-
  constraint conflict rather than a raw Postgres error.
- **`coaches.email` is the actual login-lookup key** —
  [resolve-account.ts](lib/auth/resolve-account.ts) reads it directly to
  decide where a login code goes, never the Supabase auth user's own
  email. So fixing a typo'd coach email here is sufficient on its own to
  fix that coach's login; no separate auth-side update needed.
- New "Edit" button next to each roster row's Remove/Reactivate in
  [all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>)
  opens a modal (new `EditCoachPanel`, same shape as the existing
  `AddCoachPanel`) pre-filled with the coach's current values.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested in a
  focused mock: editing Tara's name/timezone/visibility saved and
  reflected immediately in the table; trying to save Test Coach's email
  as Tara's already-in-use one surfaced the 409 error inline without
  closing the modal:
  [edit coach info preview](https://claude.ai/code/artifact/d178fe14-aed4-4d1f-b8bf-7c817f6220f2).

## Finance's Coach rates panel: same active-only filter as Coaches tab (2026-08-27)

You spotted the same problem on the Finance page that the Coaches roster
table just got fixed for: "Test Coach" (inactive) still showed up in the
Coach rates list. Same fix, same pattern:
- [finance/page.tsx](<app/(admin)/admin/finance/page.tsx>) now also
  selects `active` from `coaches`.
- [finance-client.tsx](<app/(admin)/admin/finance/finance-client.tsx>) —
  new `showInactiveCoaches` state (unchecked by default) and a
  `rateCoaches` filter, same "Show inactive coaches" checkbox placed
  right above the Coach rates table. Deliberately scoped to just this
  panel — the rollup coach-filter dropdown and the Add Adjustment coach
  picker elsewhere on the page were untouched, not part of what you
  flagged.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested in a
  focused mock (just this panel): Test Coach hidden by default, checkbox
  brings it back:
  [coach rates filter preview](https://claude.ai/code/artifact/9fe034ad-67fc-4002-a308-3c68f12e75ff).

## Exercise sync fully working: RLS gap, stale list, duplicate assigns, playback speed (2026-08-27)

Confirmed live: exercise sync itself (the URL-vs-bare-id fix from
earlier today) works — 3 exercises synced from Drive. Four more bugs
turned up in the assign/playback flow right after, all confirmed fixed:

- **Students saw generic "Exercise" titles with no audio.** RLS never
  had a SELECT policy for students on the `exercises` table itself —
  only on `exercise_assignments` (0024). The nested
  `exercise_assignments -> exercises` embed in
  [lib/exercises.ts](lib/exercises.ts)'s `listAssignedExercises` was
  silently returning `null` per row for students (RLS blocks embedded
  resources per-row rather than erroring the query), which is also why
  the audio route's own `exercises` lookup failed for a student
  session. Migration 0051 adds the missing policy, mirroring the
  existing coach one.
- **Admin's assigned-exercises list stayed empty after assigning 3.**
  [assign-exercise-panel.tsx](components/assign-exercise-panel.tsx) set
  a "Assigned." confirmation but never refreshed the page — the list
  below it (which already had its own working `<audio>` player) was a
  server-rendered snapshot from initial page load. Read at first as
  "can't preview on admin side," same root cause. Fixed with
  `router.refresh()` for the admin student-detail page (a plain server
  component); the coach dashboard needed a different fix
  (`refreshAssignedExercises`) since its assigned list is client state
  that a router refresh alone doesn't reach.
- **Same exercise assignable to the same student twice** — nothing
  stopped it; "2 Note Toggle" ended up assigned twice during testing.
  Migration 0052 dedupes existing duplicates and adds a unique
  constraint on `(exercise_id, student_id)`; the assign route returns a
  clear 409 on conflict; the picker now filters already-assigned
  exercises out entirely so the dead end isn't offered.
- **Student couldn't adjust playback speed** —
  [student/dashboard/page.tsx](<app/(student)/student/dashboard/page.tsx>)'s
  `<audio controlsList>` had `noplaybackrate` explicitly set. Removed.

`npx tsc --noEmit -p .` and `next build` clean throughout. You ran
migrations 0051 and 0052 against production Supabase directly and
confirmed both — sync, real titles, working audio, no-duplicate
assigns, and playback speed control all working live.

## Coaches tab: admin-editable meeting/classroom links (2026-08-27)

Admin and admin_finance can now set/change each coach's Google Meet link
and (new) Google Classroom link directly from the Coaches roster table —
previously `coaches.meet_link` (migration 0001) had no UI at all; it
could only ever be set by hand in Supabase, and nothing read it anywhere
except the student dashboard's "Join session" button.

- New migration
  [0050_coach_classroom_link.sql](supabase/migrations/0050_coach_classroom_link.sql) —
  adds `coaches.classroom_link`. **Confirmed applied 2026-08-27.**
- New [app/api/admin/coach-links/route.ts](app/api/admin/coach-links/route.ts) —
  updates one or both of `meet_link`/`classroom_link`. Deliberately
  `isAdminRole()`-gated, not `hasFinanceRole()`: these are session-joining
  links, not money, so both `admin` and `admin_finance` get parity here
  (same boundary `coach-active`/route.ts already uses), unlike
  `coach-rate`'s finance-only gate. Relies on the existing "admins can
  update coaches" RLS policy (0041) — no new policy needed, it's already
  a table-wide policy widened to admit `admin_finance` via `is_admin()`
  (0046).
- Roster table in
  [all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>)
  gained two columns, each independently click-to-edit (new
  `CoachLinkCell`, same nothing-writes-until-Save pattern as Finance's
  coach-rate row): a set link shows "Open" (opens in a new tab) + "Edit";
  an unset one shows "Not set" + "Edit". Saving an empty value clears it
  back to null rather than storing `""`.
  [page.tsx](<app/(admin)/admin/coaches/page.tsx>) now selects both
  columns and passes them through the existing `coachRows` mapping.
- **Roster table now also defaults to active-only**, per your feedback
  after seeing it live (you were on the deployed site testing before
  this change had shipped, which is why the columns weren't visible yet
  — this was still sitting locally, unpushed). New "Show inactive
  coaches" checkbox above the table (`showInactiveCoaches` state,
  unchecked by default); the table body now maps over `rosterCoaches`
  (`showInactiveCoaches ? coaches : coaches.filter(c => c.active)`)
  instead of raw `coaches`. Independent of the existing `activeCoaches`
  filter that already fed the day-schedule coach picker above — that one
  was untouched, only the bottom roster table lacked any filter before
  this.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested via a
  focused mock (just the roster table, not the full day-scheduler grid
  above it — that part is unchanged): setting a link, opening it, and
  clearing one back to "Not set" all worked, with a visible "Saving…"
  state and a confirmation toast; republished after the active-only
  filter was added — unchecking "Show inactive coaches" hides an
  inactive coach, checking it brings them back.

**Corrected same day: meeting link and classroom link are the same
thing for this studio, not two separate links** — you caught this right
after the two-column version deployed. Reverted to a single "Meeting
link" column/field:
- New migration
  [0053_drop_coach_classroom_link.sql](supabase/migrations/0053_drop_coach_classroom_link.sql)
  drops `coaches.classroom_link` again — it was live for under a day and
  never actually used, so dropped rather than left as dead schema.
  **Not yet confirmed applied** — see Action needed below.
- [coach-links/route.ts](app/api/admin/coach-links/route.ts) now only
  takes `meetLink`; `all-coaches-day-client.tsx`'s `CoachLinkCell` lost
  its `field` prop (single-purpose now, hardcoded to `meet_link`); the
  roster table is back to one link column, not two.
- `npx tsc --noEmit -p .` and `next build` clean (had to clear a stale
  `.next/types` cache again, same as the Finance-page-move session).
  Re-verified in the same, now-single-column mock:
  [coach meeting links preview](https://claude.ai/code/artifact/90ea951a-bb13-4d77-a963-33e66120e19c).

## Exercise sync: root cause found — env var held a URL, not the id (2026-08-27)

Picked up the exercise sync bug from the last session's handoff.
Google service account credentials turned out fine all along — you
regenerated the private key on the existing service account and
redeployed, no change in the error, which was the first real signal
credentials weren't it.

Added temporary debug output to [sync/route.ts](app/api/admin/exercises/sync/route.ts)
(masked env var lengths/snippets in the error response) and to
[exercises-client.tsx](<app/(admin)/admin/exercises/exercises-client.tsx>)
(show the full response body, since testing happens on phone with no
easy devtools access) — two separate pushes, confirmed live. That
surfaced it immediately: `GOOGLE_EXERCISES_FOLDER_ID` held the full
`drive.google.com/drive/folders/<id>` share URL (72 chars, starts
`http`), not the bare folder id. Drive's API doesn't validate/report
that clearly — it just returns the same opaque `File not found: .`
regardless of whether the id is missing, malformed, or a full URL,
which is why every prior credential/permission theory kept looking
plausible without ever resolving.

Fixed the route to extract the id whether the env var holds a bare id
or the full URL (`/\/folders\/([a-zA-Z0-9_-]+)/` match, falling back
to the raw value), and reverted both temp debug additions. `npx tsc
--noEmit -p .` and `next build` clean. **Not yet confirmed synced
successfully** — waiting on you to retry after this deploys. If it
still fails, the debug fields are gone now (reverted), so re-add them
temporarily rather than guessing blind again.

## Exercise sync follow-up: found the real Drive issues (2026-08-26)

Fixing the admin_finance 403 surfaced two more real, separate problems,
not one:
- `GOOGLE_EXERCISES_FOLDER_ID` was genuinely unset in production — you
  added it (folder ID `13yP7mzDiZcbR6tZ0e3WVyNJoZI8WMHE_`, the studio's
  "Vocal Exercises (Tara Simon)" folder).
- That got past the "not configured" check but then hit `File not
  found: .` from Google's API. Checked the folder's sharing directly —
  `info@tarasimonstudios.com` already has Content manager access, so
  it's **not** a permissions problem. Two real code issues instead: (1)
  the folder's files are all `.mp4` (voice-memo/screen-recording
  exports), which Drive tags `video/mp4` even for audio-only content —
  [drive.ts](lib/google/drive.ts)'s sync query only matched `mimeType
  contains 'audio/'`, so it would've found zero files regardless of the
  folder ID being right; now admits `video/mp4` too. (2) defensively
  `.trim()`'d the env var in
  [sync/route.ts](app/api/admin/exercises/sync/route.ts) — a stray
  trailing space/newline from the Vercel paste is a real possibility and
  would produce exactly this "blank id" error shape.

Not yet confirmed fixed — waiting on you to redeploy and retry Sync.

## Collapsible admin sidebar, exercise sync 403, Backstage link fix (2026-08-26)

Three quick requests once admin login was working:
- **Admin sidebar is now collapsible** — toggle button at the bottom
  ([admin-nav.tsx](<app/(admin)/admin-nav.tsx>)) shrinks it to a
  68px icon-only rail, preference saved in `localStorage`
  (`admin-sidebar-collapsed`) so it persists across page loads. Active
  page highlight, hover, and the Needs Review badge (becomes a plain dot
  when collapsed, full count when expanded) all still work. Verified via
  a throwaway mock, not the real dashboard (needs a live session).
- **Exercise sync was 403ing for `admin_finance`** — real bug, not a
  Drive/credentials issue: [sync/route.ts](app/api/admin/exercises/sync/route.ts)
  checked `role !== "admin"` literally, the exact mistake
  [lib/auth/roles.ts](lib/auth/roles.ts)'s `isAdminRole()` helper exists
  to prevent (that file's own comment calls this out), but this route
  never used it. Fixed. **If sync still fails after this deploys**, the
  next suspect is `GOOGLE_EXERCISES_FOLDER_ID` or the Drive service
  account's access to that folder — different failure mode, not
  something this fix touches; the sync button now surfaces whatever
  error comes back, so the real message will show if so.
- **Admin's Community page still pointed at the old `/community` URL**
  and label — [community/page.tsx](<app/(admin)/admin/community/page.tsx>)
  updated to the same Backstage URL/label/`target="_self"` treatment
  student and coach nav already got; sidebar label
  ([admin-nav.tsx](<app/(admin)/admin-nav.tsx>)) updated to match.

`npx tsc --noEmit -p .` and `next build` clean.

## Admin Access set up, all three roles confirmed working live (2026-08-26)

Admin login was still failing after the pagination fix above — turned
out to be two genuinely missing pieces, not a code bug this time: no
Supabase auth user existed yet for `mimi@tarasimonstudios.com` at all,
and after that got created, no matching `profiles` row existed either.
Both created directly in Supabase (auth user, then a `profiles` row with
`role: admin_finance`). Confirmed via the auth Users list and the
`profiles` table directly — six other test/seed rows already existed
there (`test-admin@`, `test-coach@`, `mimiorac@gmail.com`, etc.) but none
for this specific account, which is why the earlier round of debugging
kept coming back to "not registered" even after the pagination bug was
fixed — that bug was real, but wasn't what was blocking this login.

**End state: student, coach, and admin all confirmed logging in
successfully through their respective Kajabi Library Card iframe embeds
on a real phone.** Admin Access was set up the same way Coach Access
was — duplicating the already-working product/theme rather than
rebuilding the `{% layout none %}` / `product.liquid` wiring from
scratch, `src` swapped to `/admin/overview`.

## Admin login lookup bug: only checked the first page of auth users (2026-08-26)

Setting up Admin Access surfaced this immediately: you created a
`profiles` row for `mimi@tarasimonstudios.com` with role `admin_finance`
(correct), but login still said "you don't have permission." Root
cause, not a provisioning mistake — [resolve-account.ts](lib/auth/resolve-account.ts)'s
admin/admin_finance lookup called `admin.auth.admin.listUsers()`
unpaginated, which only returns the first page (50 users by default),
and this Supabase SDK version has no `getUserByEmail()` to look up a
single user directly. With this app's real student/coach count likely
well past 50 total auth users, any admin account created more recently
than the ~50th user overall could never be found — the exact bug
pattern here. Fixed by paginating through every page until a match
turns up or the list is exhausted (new `findAuthUserByEmail` helper in
the same file). This wasn't specific to Mimi's account — any admin
created "late" relative to the full auth-user count would have hit the
same wall; worth knowing if any other admin/admin_finance logins were
quietly failing before now.

`npx tsc --noEmit -p .` and `next build` clean.

## Unregistered-email error, and the Coach Access Kajabi setup (2026-08-26)

**Coach Access iframe embed working.** Same issue as Student Access at
first: a page-level Custom Code block doesn't override a Product page's
content, and this time `app.liquid` alone didn't help either — Kajabi's
own theme docs confirm `theme.liquid` is the actual default layout, and
a specific template only uses another layout via an explicit
`{% layout %}` directive at its top; simply naming a file `app.liquid`
doesn't make Kajabi use it. Ultimately unblocked by duplicating the
already-working Student Access product/theme and swapping the URL to
`/coach/dashboard` — more reliable than fighting the theme structure
from scratch. Same duplicate-and-swap approach recommended for Admin
Access when that's next.

**Unregistered-email login now shows a real error instead of a dead
end.** Surfaced by testing with an email that wasn't provisioned as a
coach — the code page displayed as if a code had been sent, but nothing
ever would have arrived, no explanation given. `request-login-code`
([route.ts](app/api/auth/request-login-code/route.ts)) used to stay
silent either way as a deliberate anti-enumeration measure (documented
in an earlier session). **You explicitly asked to reverse that** — this
is a small, invite-only studio roster, not a public consumer app, and a
confused, stuck user is the worse real-world failure mode here. Now
shows "You don't have permission to enter this studio. Please contact
admin at info@tarasimonstudios.com." and stays on the email step. A
genuine email-delivery failure for a real account still falls through
to the generic success response — only "no account exists for this
email at all" gets the explicit message, so it can't be mistaken for a
delivery hiccup.

`npx tsc --noEmit -p .` and `next build` clean. Verified in the dev
server: an unregistered email shows the error inline, stays on the
email step, no code-entry dead end.

## Kajabi-side: mobile Safari fixed via a dedicated theme; branded-app path noted for later (2026-08-26)

**Mobile Safari is confirmed fully working now** — you found the real
issue yourself: the page-level Custom Code block doesn't actually
override a Kajabi Product page's content (it just adds a small embed
somewhere within Kajabi's own default template — the "0 modules" native
UI kept showing underneath). The fix had to happen one level up: a
dedicated theme ("Momentum") with a custom `app.liquid` layout that
replaces the *entire* page output with the iframe, rather than trying to
inject via the page's own Custom Code widget. I gave you a complete
`app.liquid` (proper `<!DOCTYPE html>`/`<head>`/viewport meta on the
*outer* Kajabi page, `overflow:hidden` so only the iframe scrolls,
`100dvh`-first sizing) — the missing viewport meta tag on that outer
page was likely the real remaining cause of the "too small/zoomed"
look, separate from anything in this repo. You confirmed "everything is
good now on mobile" after switching to it.

**New, separate finding: this whole setup doesn't carry over to the
Kajabi native/branded app.** Logging in through the actual Kajabi app
(App Store), "Student Access" renders as Kajabi's own generic
Product/Library template ("0 modules", broken image placeholder) —
completely ignoring the custom theme/`app.liquid` above. Confirmed
against Kajabi's own docs: *"The Branded App does not currently support
the integration of customizations made on the website, as there is no
mechanism to automatically transfer these changes"*
([Kajabi Branded App FAQs](https://help.kajabi.com/en/articles/12696396-kajabi-branded-app-faqs)).
Product/Library content in the app renders via Kajabi's own native
templates, not the website's Liquid theme — a completely different
rendering path, not something fixable from this repo or the website's
theme editor.

**The real path for the branded-app launch, when that's prioritized:**
Branded Apps support **Custom Screens** with an **Embed Code widget**
that accepts raw HTML — a native-app mechanism, separate from (and not
subject to) the website-customization limitation above
([How to Create Custom Screens](https://help.kajabi.com/en/articles/12696372-how-to-create-custom-screens-for-your-branded-mobile-app),
[Widget docs confirming Embed Code accepts arbitrary HTML](https://help.kajabi.com/en/articles/12696339-how-to-customize-widgets-on-your-branded-app-screens)).
Plan: Branded App → Design → Customize → Screens → new screen per role
(Student/Coach/Admin) → Embed Code widget → same iframe snippet as
`app.liquid`, pointing at the matching dashboard route → add each
screen to the app's bottom nav in place of the generic Product tiles.
**Not yet tested — flagging real uncertainty, not assuming it'll just
work:** the Embed Code widget likely renders in the branded app's own
native WebView, which may have its own cookie/session behavior distinct
from Safari's (the cross-iframe cookie bug fixed earlier this session
was Safari-specific — a native WebView could behave differently, better
or worse). The login flow needs a real test inside that Custom Screen
once it exists, same as Safari needed one. Nothing to build in this repo
for this yet — entirely Kajabi-side configuration, revisit when the
branded app becomes a priority.

## Real-mobile follow-up: login loop confirmed fixed, new zoom bug found (2026-08-26)

You confirmed the login loop fix worked — got past login on the real
iPhone this time. Two new things came out of that same test:

- **"Just gray background for so long" after logging in, chat box
  zoomed in, had to scroll up to find the header.** Root cause: the
  email field on `/login` renders at 14px, and several other fields
  across the app (chat, notes, booking forms) are under 16px too — iOS
  Safari auto-zooms the whole page in when a focused field's font-size
  is below 16px. Inside the Kajabi iframe, that zoom state didn't reset
  on the next page (a plain `window.location` navigation, not a fresh
  tab), so it carried straight into the dashboard already zoomed to
  wherever the chat box happened to land — with no visible cue why.
  Fixed with one global rule in
  [globals.css](app/globals.css): every `input`/`textarea`/`select`
  forced to 16px on screens ≤640px, rather than hunting down and
  raising each individual component's font-size by hand.
- **Login card "still too small."** Confirmed this is at least two
  separate things layered together: the 14px-input zoom-triggering
  above (now fixed, should itself make the field read as less cramped),
  and the outer iframe box's `height:100vh` (Kajabi Custom Code side,
  not this repo) potentially sizing taller than the visible screen on
  mobile Safari. Still flagged from last round: if it still looks
  small/floaty after this deploys, try `height:100dvh` on the Kajabi
  `<iframe>` tag itself.

`npx tsc --noEmit -p .` and `next build` clean. Verified the 16px rule
actually applies at mobile width via computed-style check in a dev-server
mock (`getComputedStyle` confirmed `16px` on the email input at 375px
viewport) — the real "does the zoom-on-focus problem stop happening"
question still needs you to retest live on your phone, same as before.

## Real-mobile login loop — Safari cross-iframe cookie fix (2026-08-26)

Every login test so far had been either desktop Chrome or Chrome's mobile
*emulation* (a narrowed window, still directly on portal.tarasimonstudios.com
— never actually inside the Kajabi iframe). First real test on an actual
iPhone, through the real Kajabi embed, hit a hard login loop: enter code,
"verify" appears to succeed, gets bounced straight back to
`/login?error=not_logged_in`. 3 attempts, same result.

**Root cause:** [verify-login-code/route.ts](app/api/auth/verify-login-code/route.ts)
minted a Supabase magic link and had the client redeem it — visiting
Supabase's own domain, then `/auth/callback`, which calls the *client-side*
`supabase.auth.setSession()` (writes the session cookie via
`document.cookie`, not a `Set-Cookie` header). Inside the Kajabi iframe
(`portal.tarasimonstudios.com` framed by `app.tarasimonstudios.com`),
Safari's Intelligent Tracking Prevention was blocking that JS-written
cookie — the session never persisted, so the very next request found no
session and bounced back to login. This never showed up in any prior
test because none of them went through a real cross-origin iframe on
Safari specifically.

**Fix:** `verify-login-code` now redeems the token itself, server-side,
via `supabase.auth.verifyOtp({ token_hash, type: "magiclink" })` on the
request's own server Supabase client
([lib/supabase/server.ts](lib/supabase/server.ts)) — the session gets
set through a real `Set-Cookie` response header on a same-origin
request. No client-side cookie write, no bounce through Supabase's
domain, nothing for Safari's cross-iframe blocking to catch.
[app/auth/callback/page.tsx](app/auth/callback/page.tsx) is untouched —
still needed for the coach/admin provisioning magic-link-**email** flow,
which opens as a normal top-level tab (not iframed) and never had this
problem.

Also: the login card looked like it was floating in a huge empty dark
void on the real phone — `100vh` on mobile Safari is measured against
the tallest possible viewport (address bar collapsed), not what's
actually on screen, and the Kajabi Custom Code block's `<iframe>` is
itself sized via `height:100vh`, so the box our page centers in was
taller than the visible area. Swapped `min-height: 100vh` (and
`.appSidebar`'s `height: 100vh` in admin) for `100dvh` with a `100vh`
fallback across every full-height root — student/coach/admin/login. This
only fixes *our own* content's sizing within whatever box height the
iframe ends up being, though — if the Kajabi Custom Code snippet itself
still uses `height:100vh` on the `<iframe>` tag, the outer box can still
end up taller than the visible screen on Safari. **If the card still
looks too small/floaty after this deploys, the real fix is changing that
`<iframe>` tag's `height:100vh` to `height:100dvh` in the Kajabi Custom
Code block itself** — that's Kajabi-side content, not something in this
repo.

`npx tsc --noEmit -p .` and `next build` clean. **Could not verify this
end-to-end myself** — no Safari environment available in this session's
tooling, and directly seeding a test code into the live `login_codes`
table to bypass email was blocked by this environment's own safety
guardrails (reasonably — that's real production data). This one
genuinely needs you to retest live on your phone through the actual
Kajabi embed before it's considered confirmed fixed.

## Kajabi nav links — same-tab navigation (2026-08-26)

You asked whether "My Library"/"Backstage" could "open in app" for a
one-app feel. Checked both directions:
- **Embedding Kajabi's pages inside our portal (a second nested
  iframe): confirmed impossible.** `curl -sI` against
  `app.tarasimonstudios.com/library` and
  `.../products/communities/v2/backstagehub` both return
  `content-security-policy: frame-ancestors 'self' https://app.kajabi.com
  https://app.vibely.io ... https://app.tarasimonstudios.com` —
  `portal.tarasimonstudios.com` isn't in that list, and it's a
  platform-level Kajabi header, not a setting either side can change.
- **What we could control: the `target` attribute.** Changed both links
  from `target="_blank"` (new tab) to `target="_self"` on
  [student-nav.tsx](<app/(student)/student-nav.tsx>) and
  [coach-nav.tsx](<app/(coach)/coach-nav.tsx>) (4 anchors each — inline
  nav + mobile dropdown). Since the portal itself lives inside Kajabi's
  Library Card iframe, `_self` navigates *that same iframe* in place to
  the Kajabi page — no new tab, and it's a single-level ancestor chain
  Kajabi's own CSP already allows (unlike the nested-iframe idea above).
  Dropped the paired `rel="noopener noreferrer"` too — that exists to
  guard a *new tab*, not an in-place same-org navigation.
- **Disclosed tradeoff, not fixed:** cross-origin iframe in-place
  navigation isn't always added cleanly to the browser's joint session
  history, so the Back button returning from Kajabi's Library page to
  the portal isn't fully reliable. Practical mitigation — a "Back to
  Studio" link on the Kajabi Library/Backstage pages pointing at
  `/products/student-access` — is a Kajabi-side content edit, not code.
- **Still open, needs you to check:** does the Kajabi product page
  (where the Library Card iframe lives) already show a persistent
  Kajabi nav around the embed? And does the Custom Code block's
  `<iframe>` tag have a `sandbox` attribute — if so, confirm it
  includes navigation-related `allow-*` tokens, or `_self` navigation
  could get blocked at the iframe level regardless of Kajabi's CSP.

`npx tsc --noEmit -p .` and `next build` clean. Not click-tested live
(needs the real Kajabi embed) — same constraint as every other
Kajabi-side change this session.

## Live Kajabi test session (2026-08-26)

First real end-to-end test of the Kajabi iframe embed, with you as a
test student. Found and fixed three real bugs in sequence:
- `NEXT_PUBLIC_KAJABI_SITE_URL` wasn't set in Vercel Production, so the
  CSP `frame-ancestors` header only allowed the portal's own origin —
  Kajabi's iframe was blocked outright ("refused to connect"). Fixed
  once you added the env var and redeployed.
- The whole accumulated backlog (this progress log's entire feature
  set, ~180 files) had never actually been committed/pushed — Vercel
  was serving a stale build with the old login page, which is why the
  new email+code flow didn't appear at first. Pushed.
- Login code arrived but landed in spam — not a bug, but exposed a real
  gap: no way to request a fresh one before the 10-minute TTL closed.
  Added a "Resend code" option (60s cooldown) to
  [login-form.tsx](app/login/login-form.tsx).
- [components/chat-panel.tsx](components/chat-panel.tsx) was calling
  `scrollIntoView` on every 4s poll regardless of whether new messages
  arrived — inside the Kajabi iframe this scrolled the whole outer page
  back to the chat section repeatedly ("keeps bouncing to this view").
  Fixed to scroll only the chat's own message-list container, and only
  when a message was actually added.
- Student header nav (Courses/Community/Scheduler/timezone) wrapped
  awkwardly on mobile. Per your mockup, extracted it into a new
  [student-nav.tsx](<app/(student)/student-nav.tsx>) client component
  (same pattern as `coach-nav.tsx`/`admin-nav.tsx`) that collapses
  below 640px into a hamburger dropdown. Also renamed per the mockup:
  "Courses" → "My Library" (`KAJABI_SITE_URL/library`), "Community" →
  "Backstage" (`KAJABI_SITE_URL/products/communities/v2/backstagehub`).
  You confirmed the same treatment should apply to
  [coach-nav.tsx](<app/(coach)/coach-nav.tsx>) — done: all coach nav
  (Dashboard/My Schedule/My Students/Payroll + the two Kajabi links) now
  collapses into the same hamburger dropdown below 640px, active-page
  bolded in the dropdown same as inline. Caught a real overflow bug
  while verifying the coach version in a mock: the dropdown was
  anchored to `.nav`'s own right edge (`position: relative` on `.nav`),
  but coach's header has a wider trailing group after nav (timezone +
  avatar + role badge) than student's (avatar only), pushing `.nav`'s
  right edge — and the dropdown anchored to it — far enough left to run
  off the left side of a 375px screen. Fixed by anchoring to `.header`
  instead (already positioned via `position: sticky`) with
  `right: 32px` matching the header's own padding — applied to both
  `coach.module.css` and `student.module.css` for consistency, even
  though student's narrower trailing group had happened not to trigger
  the bug visibly.

Also added the real logo (you supplied the source PNG) in place of the
"LOGO" placeholder box — student/coach headers, admin sidebar brand, and
the login page — recolored to the app's `--gold` purple token. See
[public/logo.png](public/logo.png).

## ⚠️ Action needed from you

**Migrations 0070 and 0071 confirmed applied** (2026-08-29) — the
student-migration-fields feature (Phone/Gender/Address/Guardian panels,
Staff Notes pinning) is live.

**Migration 0072 confirmed applied** (2026-08-28) — retested Delete
again after this one and it succeeded. `delete_student_permanently()`
has now been exercised live across three rounds of real bugs
(entitlements/recurring-schedule ordering in 0069, profiles ordering in
0072) with no further failures reported.

**Migration 0069 confirmed applied** (2026-08-28) — retested Delete on a
disposable student with a trial entitlement and a recurring schedule
(the exact two things that exposed the original bugs) and it succeeded
for that case; a further retest then found 0072's bug (above).

**Migrations 0067 and 0068 confirmed applied** (2026-08-28) — the
archive flag and the delete function itself exist and are callable;
0069 fixes real bugs found on first use, not a gap in these two.

**Migrations 0064, 0065, and 0066 confirmed applied** (2026-08-28) —
the Activity Log feature (data-change trigger + login/join-click
logging) and the recurring-coach-block start-date addition are both
live.

**Migration 0063 confirmed applied** (2026-08-28) — the recurring
coach time-off feature (Team Huddle, per-coach lunch/dinner breaks) is
live.

**New migration 0062 not yet confirmed applied** —
`supabase/migrations/0062_fix_attention_items_duplication.sql` cleans
up the "Needs Action (42)" duplication bug and adds a unique index
that prevents it recurring. Until this runs, the dedup fix in
`lib/admin/attention-items.ts` will hit the old data (still 42 rows)
and the app-side `upsert(..., { onConflict: "student_id,kind" })` call
will actually ERROR — there's no matching unique constraint on the
live DB yet for Postgres to conflict against. Run 0062 before using
Needs Review again.

**New migration 0061 not yet confirmed applied** — 0060 didn't
actually fix the makeup_credits recursion; it hit a *different*,
genuinely self-referential policy from 0012 (student-fault cap check
subqueries makeup_credits itself), confirmed still failing live after
0060 was applied. `0061_fix_makeup_credits_self_reference.sql` moves
that count into a SECURITY DEFINER function. Until this runs, granting
a credit (single or multi-line) will keep failing with "infinite
recursion detected in policy for relation makeup_credits".

**Migration 0060 confirmed applied** (2026-08-28) — fixed 4 of the 5
makeup_credits policies, just not the one actually causing the error.

**Migrations 0057–0059 confirmed applied** (2026-08-28). Covers: 0057
`recurring_schedules.cadence` (weekly/biweekly), 0058
`students.ambassador`, 0059 `students.student_since_override`. Code
built against these (Weekly/Biweekly selector, Ambassador toggle, CSV
bulk-import, the "With us" override) can now be committed/deployed
without hitting missing-column errors.

**Still not deployed: none of this session's code has been pushed to
`main` yet** (ambassador tag, 4-pack credits, CSV bulk import, the
biweekly cadence UI, the one-go lesson setup on the manual-add form, the
three new date fields — all still local/uncommitted as of this note).
Production (Vercel, deploys off `main`) still shows the old Students
page with none of it — confirmed live, this is exactly why the new
"Import students from CSV" panel wasn't visible yet. Commit + push
whenever you're ready for it to go live.

**Migrations 0045–0055 all confirmed applied** (2026-08-28). Covers:
0045 referral bonus column, 0046 admin_finance role, 0047 payroll manual
adjustments, 0048 payroll coach_seen_at, 0049 login_codes table, 0053
drop coach classroom_link, 0054 sessions DELETE policy for admin
(recurring-schedule changes no longer leave stale duplicate sessions
behind), 0055 studio_holidays. Mimi Test's stray duplicate session on
Celine's calendar (the pre-0054 leftover) is also resolved.

**Migrations 0036–0044 confirmed applied.** ✅ (0044 confirmed 2026-08-25 —
`coaches.pending_working_hours` / `pending_effective_date`, effective-dated
availability changes on the Coaches tab.)

**Env vars needed** (added to `.env.example`, not yet set for real):
- `SLACK_WEBHOOK_URL` — for coach-block Slack notifications. Feature code
  is done; nothing will actually post to Slack until you create the
  webhook in Slack and set this in your real `.env`.
- `NEXT_PUBLIC_APP_URL` — confirm this is `https://portal.tarasimonstudios.com`
  in production. Every magic-link email's redirect URL is built from
  this value.
- `NEXT_PUBLIC_KAJABI_SITE_URL` — confirm this is `https://app.tarasimonstudios.com`
  in production. Beyond the existing Courses/Community nav links, this
  now also controls which site is allowed to iframe-embed the portal
  (`next.config.mjs`'s CSP `frame-ancestors`) — the Kajabi Library Card
  embeds won't render at all if this is unset or wrong.

Migrations 0031–0035 confirmed applied.

## Branding

**Real logo added, replacing the "LOGO" placeholder box everywhere it
appeared.** You supplied the source PNG (purple/blue music-note mark);
recolored to the app's exact `--gold` purple (`#a78bfa`, same token
every dashboard's accent already uses) by hue-shifting while compressing
the original's lightness range toward that token's own lightness —
keeps the mark's shading/depth instead of flattening to one solid color.
Cropped to its bounding box and saved as
[public/logo.png](public/logo.png) (transparent PNG, 125×180).
Swapped in at every spot that previously had the dashed-border "LOGO"
placeholder or a plain "CS" initials box:
- [app/(student)/layout.tsx](<app/(student)/layout.tsx>) header
- [app/(coach)/layout.tsx](<app/(coach)/layout.tsx>) header
- [app/(admin)/admin-nav.tsx](<app/(admin)/admin-nav.tsx>) sidebar brand
  (was a solid-gold "CS" square — swapped to the real mark instead)
- [app/login/page.tsx](app/login/page.tsx) — new, wasn't a placeholder
  spot before, added above the title for brand presence on the one
  public page
`npx tsc --noEmit -p .` and `next build` both clean. Visually verified
on `/login` via the dev server (the only one of the four reachable
without a real session) — logo renders crisp and correctly purple at
34–40px. Student/coach/admin headers use the exact same container
class, just swapped, so not separately click-tested — real login
required for those.

## Status by dashboard

### Coach Dashboard — done
Redesigned to dark theme, full mockup match. Built: re-markable attendance,
Trial/Group/Held slot states, month view, date-range label on every view,
exercise autocomplete, shared-folder upload, Group Lessons, pause/held-slot
handling, "Add time off" with Slack notification. Verified via interactive
mock: [coach dashboard preview](https://claude.ai/code/artifact/7ff528bc-bc31-48f8-bbab-dff497d71f53).

### Student Dashboard + Scheduler — done
Redesigned to match your mockup. Streak bulb bar, exercises above shared
folder (non-downloadable player), Shared Folder header/buttons restyled,
"Upcoming lessons this cycle" box beside "Your plan", renewal line
simplified (no more cancel-by date — policy is cancel-anytime-before-cycle-end).
**Cancellation now only happens on the Scheduler page** (dashboard's inline
cancel was removed) — Scheduler also reskinned to dark theme (fixes the
admin book-on-behalf-of page too, since `BookingClient` is shared).
Verified via interactive mocks:
[dashboard](https://claude.ai/code/artifact/d9a3a1e1-9473-45b9-a5ac-0911f4c82c02),
[scheduler](https://claude.ai/code/artifact/c8e3c94f-c9be-44b8-86b5-e3b908c6307b).

**Student self-service pause-request was built then reverted** — pause
stays 100% admin-only (student contacts studio directly, admin uses the
existing pause control on `/admin/students/[id]`). Only "Request to cancel"
remains on the student's Your Plan panel.

### Admin Dashboard — in progress, current focus
Full redesign to a left-sidebar app (matches your mockup): Overview /
Scheduler / Students / Coaches / Needs Review / Community, plus Exercises
and Group Lessons (kept, not in your mockup's 6-item list). **Payroll
removed from nav on purpose** — becomes its own separate dashboard later
(not started).

**Admin accent settled on purple (`--gold`) — same token every other
dashboard uses.** Earlier this session a separate warm gold/amber
`--admin-accent` token existed for admin only; a bug meant it was only
half-applied (sidebar nav had it, but content-area `.cta`, `.ctaSmall`,
`.linkBtn`, `.linkBtnSmall`, `.badge`, `.totalRow`, `.rowName:hover`,
`.sidebarBtnActive`, `.statCardValue` were still on plain purple). Fixed
the bug so gold applied everywhere, click-tested it, then you saw it
live and preferred plain purple — so `--admin-accent` and its dim/text
variants were removed entirely from
[admin.module.css](app/(admin)/admin.module.css); admin now matches
student/coach exactly. One leftover reference in
[overview/page.tsx](app/(admin)/admin/overview/page.tsx)'s `TIER_COLORS`
(`elite` tier dot) pointed at `--admin-accent` — changed to a plain
hardcoded `#d4a24e` so that dot stays visually distinct from `suite`
(which already uses `--gold`), since the token behind it is gone.

Still there, not yet touched: `.naKindPause`/`.naKindTrial`/
`.naKindCredit` in the Needs-Attention tag legend now all resolve to
the same purple `--gold` (they used to be 3 distinct hues) — worth
a look if those tags need to stay visually distinguishable.
`admin.module.css` also still carries ~80 lines of dead CSS from the
pre-sidebar top-header design (`.header`, `.logoMark`,
`.logoPlaceholder`, `.nav`, `.navLink`, `.navLinkActive`,
`.headerRight`, `.roleBadge`) — `admin-nav.tsx` doesn't reference any
of it anymore.

The older admin artifact previews linked below (overview / dashboard /
payroll) were built while gold was still the plan — their accent color
no longer matches the real app now that it's plain purple; only the
[admin student detail preview](https://claude.ai/code/artifact/85962c80-a780-41df-a6f2-ebca2344361e)
below has been republished with the correction.

**Needs Attention / Needs Review — the big new piece:**
- New `attention_items` table (migration 0035): every item has a real
  lifecycle (`needs_action` → `in_progress` → `resolved`) with admin notes.
  Nothing auto-resolves — matches your "everything here admin has to
  manually handle" instruction.
- 14 trigger kinds, all wired to real data/events (see
  `lib/admin/attention-items.ts` for the authoritative list + logic):
  DNC, cancel request, trial unbooked, credit expiring (<5 days), upgraded
  to Suite/Pro/Elite, coach added a block, no-show/late-cancel streak
  (1st/2nd/3rd in a row — covers both coach-marked no-shows and student
  self-service late cancels), no weekly recurring schedule (Pro/Elite),
  hold ending soon (<7 days), inactive 10+ days.
- Event hooks live in: `app/api/coach/blocks`, `app/api/coach/mark-attendance`,
  `app/api/booking/cancel`, `app/api/webhooks/kajabi`, `app/api/student/requests`.
  Condition-driven kinds are reconciled in `syncComputedAttentionItems()`,
  called on every Needs Review/Overview read.
- Overview page shows top-5 preview + live stat cards (active students/tier
  breakdown, unbooked trials, DNC count, needs-action count) — stat cards
  are live truth, independent of whether admin has "resolved" a related
  queue item.
- Layout order (per your last request): Needs Attention (full width) →
  Coach Schedule Today → Students preview table.

Verified via interactive mock:
[admin overview](https://claude.ai/code/artifact/22399261-3cad-4d5e-b804-f9e3893dfb32)
(also covers Students/Coaches/Exercises/Group Lessons views — see
[admin dashboard preview](https://claude.ai/code/artifact/8cb4b5d8-bc41-43f6-a3fb-929896bd3eb0)
and [admin payroll preview](https://claude.ai/code/artifact/bfee92a1-9352-44ab-802c-50690f1c7110)
for the rest, still accurate for Students/Coaches/Payroll UI even though
Payroll is being split out).

Admin Student Detail page click-tested this session (pause/resume,
weekly-schedule change, next-session cancel/staff-cancel, reassign
coach, show-all-sessions) — all correct on the final purple accent:
[admin student detail preview](https://claude.ai/code/artifact/85962c80-a780-41df-a6f2-ebca2344361e).

**Admin now has coach-parity on a student's detail page** — per your
ask, admin can do everything a coach can from there: add homework
notes, chat with the student, and assign exercises (shared folder
upload was already there). Changes:
- New migration `0036_admin_coach_parity.sql` — makes
  `homework_notes.coach_id` and `exercise_assignments.assigned_by_coach_id`
  nullable (admin has no coaches row to attribute to), adds an admin
  insert policy for homework notes, and widens the chat-message /
  chat-attachment insert policies to admit `is_admin()` (previously
  admin could read chat but not send — read policies already had
  `is_admin()`, write policies didn't).
- [app/api/notes/route.ts](app/api/notes/route.ts) POST and the new
  [app/api/exercises/assign/route.ts](app/api/exercises/assign/route.ts)
  (replaces the old coach-only `app/api/coach/assign-exercise`) now
  accept admin as well as coach.
- An admin-authored homework note shows "Admin" instead of a coach name
  ([components/notes-panel.tsx](components/notes-panel.tsx)); an
  admin's chat message resolves to "Admin" too (anyone not matched to
  a coach or student row, in
  [app/api/chat/messages/route.ts](app/api/chat/messages/route.ts) —
  cheaper and RLS-safe vs. a profiles lookup, which a non-admin viewer
  couldn't read anyway).
- The exercise-assign widget moved from a coach-only
  `assign-exercise-client.tsx` to a shared
  [components/assign-exercise-panel.tsx](components/assign-exercise-panel.tsx)
  (Tailwind var()-based, same reasoning as `shared-folder-panel.tsx` —
  needs to render under any route group's theme root) so both coach
  dashboard and the admin student page use the same one; removed the
  now-dead autocomplete CSS from `coach.module.css`.
- [app/(admin)/admin/students/[studentId]/page.tsx](<app/(admin)/admin/students/[studentId]/page.tsx>)
  now renders Homework Notes (editable), Chat, and Exercises panels
  alongside the existing (already-admin-capable) Shared Folder panel.
- Verified via the same
  [admin student detail preview](https://claude.ai/code/artifact/85962c80-a780-41df-a6f2-ebca2344361e)
  (mock now includes working add-note/chat-send/assign-exercise
  interactions) — real end-to-end write still blocked until migration
  0036 is applied.

**Birthday / "with coach since" — no longer live inline inputs, and the
blank fallback now shows an actual date.** You flagged these as too easy
to change by accident (birthday used to save on blur — a stray click
away from the field silently wrote it) and the coach-since field just
showed a blank `yyyy-mm-dd` box with "blank = auto from session history"
instead of the actual date. Now:
- Both are click-to-edit — read-only text with an "Edit" link that
  reveals the date input plus explicit Save/Cancel; nothing writes
  without an explicit Save. ([birth-date-client.tsx](<app/(admin)/admin/students/[studentId]/birth-date-client.tsx>),
  [coach-start-date-client.tsx](<app/(admin)/admin/students/[studentId]/coach-start-date-client.tsx>))
- "With coach since" now computes the same fallback the coach dashboard
  already used server-side (earliest session this coach actually
  taught — `lib/coach/dashboard-data.ts`'s own logic, mirrored in
  [page.tsx](<app/(admin)/admin/students/[studentId]/page.tsx>)) and
  shows that date labeled "(auto — first session)" when no admin
  override is set, instead of a blank field. A "Clear override" action
  lets admin drop back to the auto value.
- New [lib/format-date.ts](lib/format-date.ts): `formatPlainDate` for
  these plain `date` columns (birth_date, coach_start_date_override) —
  deliberately not routed through the existing `FormattedDate`/timezone
  helpers, which parse as a UTC instant and would show the day *before*
  what's stored once converted to Eastern.

**New "with us for X years Y months" tenure line** — computed from
`students.created_at` via `formatTenure()` (same new file). Assumes
enrollment date ≈ the row's creation date; flag if any migrated
students' real start predates their row (same edge case birth-date/
coach-start-date already have an override for — this one doesn't yet,
since nothing asked for an override on it).

**New Staff Notes section — admin-only, never visible to coach or
student.** New table (migration `0037_staff_notes.sql`), separate from
`homework_notes` on purpose — kept as its own table with `is_admin()`-
only RLS on both read and write, rather than a "visibility" flag on the
shared table, so private staff content is never one policy bug away
from leaking into a coach- or student-facing query. New
[app/api/admin/staff-notes/route.ts](app/api/admin/staff-notes/route.ts)
and [staff-notes-client.tsx](<app/(admin)/admin/students/[studentId]/staff-notes-client.tsx>),
rendered as its own panel at the bottom of the student page with a
coral "Admin only" badge.

**Top info block redesigned as a card, matching the student dashboard's
"Your Plan" panel** — you called the old inline text row "clunky."
Email/membership/coach/birthday/coach-since/tenure are now
label-left-value-right rows (`.statRow`/`.statKey`/`.statValue`, new in
[admin.module.css](app/(admin)/admin.module.css), copied from
`student.module.css`'s own "Your Plan" card) inside one panel, instead
of a run-on paragraph of muted text.

**Pause replaced by a Start / Pause / Stop lifecycle bar** — new
[subscription-lifecycle-client.tsx](<app/(admin)/admin/students/[studentId]/subscription-lifecycle-client.tsx>),
old `pause-client.tsx` deleted (fully superseded). Each button reveals
its own form below rather than anything being a live/always-editable
field, same reasoning as the birthday/coach-since fix above:
- **Start** — enabled only when the subscription is active, a coach is
  assigned, and no weekly schedule exists yet. Reveals a form (day/
  time/coach/duration/start date) that posts to the same
  `/api/admin/recurring-schedule` the existing Weekly Schedule panel
  uses. To avoid two ways to do the same thing, the Weekly Schedule
  panel's own "Set weekly schedule" link is suppressed while the
  subscription is active (new `hideStartPrompt` prop on
  [recurring-schedule-client.tsx](<app/(admin)/admin/students/[studentId]/recurring-schedule-client.tsx>))
  — Start is the only entry point during that window; once a schedule
  exists, Start naturally disables and Weekly Schedule's own
  Change/Remove takes over.
- **Pause** — reveals a from/to date form plus the current billing
  cycle's renewal date (`renewalInfo()`, [lib/billing/renewal.ts](lib/billing/renewal.ts) —
  already existed, just hadn't been surfaced here) and a warning that
  pausing can't refund a cycle already billed, only stop the next one.
  When already paused, the button shows the current pause dates and a
  Resume action instead — same `/api/admin/set-pause-status` endpoint
  as before.
- **Stop** — this one needed a real design decision, see below.

**Stop / cancellation — clarified with you mid-build:** initially built
around subscription_status flipping to 'cancelled' automatically, but
you corrected that — **Kajabi owns actual cancellation, this app never
sees it happen**, and admin often tries to retain a student rather than
just letting a cancellation proceed. So Stop now:
- With no cancellation on file: reveals a reason field (required) and a
  danger-styled "Flag cancellation" button. This does **not** cancel
  anything — it creates a `student_requests` row (same shape as the
  existing student self-service "Request to cancel" flow, just admin-
  initiated — new [app/api/admin/flag-cancellation/route.ts](app/api/admin/flag-cancellation/route.ts))
  and a Needs Review item, so it can't be missed, exactly like a
  student-submitted request already does.
- With a cancellation pending or approved: shows the reason, the
  billing-cycle-end date, and the last scheduled session at/before that
  date (auto-computed, admin can override and save — new
  [app/api/admin/set-last-session-override/route.ts](app/api/admin/set-last-session-override/route.ts),
  backed by the new `last_session_override` column). A "Mark retained"
  button flips it to `student_requests.status = 'denied'` instead of
  the usual 'approved' — extended
  [resolveAttentionItem()](lib/admin/attention-items.ts) with an
  optional `requestOutcome` param (defaults to `'approved'`, so every
  existing call site is unaffected) so retention doesn't need a
  parallel resolution path.
- **New backend behavior, not just UI:** if a cancellation is still
  pending or approved (not retained/denied) once the *next* billing
  cycle starts, `materializeRecurringSessions()`
  ([lib/scheduling/recurring.ts](lib/scheduling/recurring.ts)) now
  stops generating any further sessions for that student past the
  cycle's effective-end date — same mechanism as the existing pause-
  window filter, just gated on an unresolved cancellation instead. This
  is what makes "if not resolved, no sessions populate next cycle"
  happen automatically without admin having to remember to remove the
  recurring schedule by hand.

**Stop panel follow-ups from your feedback:** the "Mark retained" button
had no counterpart — added a "Mark cancelled (confirmed)" button right
next to it (calls the same `/api/admin/attention-items/resolve` with
the default `requestOutcome: "approved"`), and removed the "Resolve in
Needs Review" link entirely — you don't need it, the cancellation
already surfaces in Needs Review/Overview automatically the moment it's
flagged (same `attention_items` row every other queue item uses), no
extra wiring needed for that part.

**Answering "does it auto-flag when a student cancels in Kajabi": yes,
now — it didn't before.** There's no Kajabi *webhook* for cancellation
(confirmed in the code comments — Kajabi doesn't send one from either
of its two webhook surfaces). What already existed is a 5-minute
polling cron, [app/api/cron/kajabi-sync/route.ts](app/api/cron/kajabi-sync/route.ts),
that checks whether each student still holds an active tier offer in
Kajabi and flips `subscription_status` to `cancelled` if not — but it
did this **silently**, no admin visibility at all, which is the gap you
were actually asking about. Now, the moment that cron detects a
cancellation, it also creates the same `student_requests` +
`attention_items` row the manual Stop flow does (status `approved`
outright, since Kajabi already confirmed it — nothing to review, just
to act on), so it lands in Needs Review/Overview exactly like a
manually-flagged one, and "Mark retained" still works there if you win
the student back.

**Coaches can now see when their own student is flagged cancelling
too** — a coral warning banner on the coach dashboard's student detail
panel (whichever of the three sources flagged it: student self-service,
admin-flagged, or Kajabi-detected), showing the reason and billing-end
date, so they have a shot at retaining the student themselves. New
`cancellationFlag` field on `getStudentSnapshot()`
([lib/coach/dashboard-data.ts](lib/coach/dashboard-data.ts)) and its
banner in
[dashboard-client.tsx](<app/(coach)/coach/dashboard/dashboard-client.tsx>);
migration `0039_coach_cancellation_visibility.sql` gives coaches read
access to `student_requests` for their own students (previously only
student-own-row and admin had any policy on that table at all). Not
separately re-verified in the interactive mock this round — small,
type-checked, isolated addition; only the admin student-page mock was
updated.

**Two more lifecycle-bar fixes from your feedback, both click-tested in
the mock:**
- **Start** now reads "Recurring booked" (not just greyed-out "Start")
  whenever a weekly schedule already exists, so the disabled state is
  legible on its own — you don't have to notice a subtle opacity change
  to know why it's inactive.
- **Unpause needs a confirmation step now** — clicking it while paused
  no longer resumes instantly. It shows "Make sure student is aware of
  unpause and has paid for the unpause" with a Yes/Never-mind choice
  first, mirroring the confirm-step pattern the Cancel/Staff-cancel
  buttons already use elsewhere on this page. Paused state also now
  reads clearly as a from→to range and the button itself relabels to
  "Paused" while active.

**Pause mechanics filled in — this was previously just a status flag
with no actual session-level effect.** You described the real business
rules; here's what was missing and what's now built:
- **The gap:** `set-pause-status` only ever flipped
  `students.subscription_status`. It never touched any session rows —
  so a student paused *after* their next several weeks of recurring
  sessions were already materialized (which happens routinely, since
  `materializeRecurringSessions` runs ahead of time) would still have
  those sessions sitting there as normal `'scheduled'` rows: visible on
  the student's own dashboard, needing attendance marking, and payable
  to the coach. None of that matches "student can't attend, slot stays
  held, coach isn't paid for it."
- **New `'paused'` session status** (migration
  `0040_paused_session_status.sql`) — deliberately not a reuse of
  `'cancelled-no-notice'`, even though it gets the identical grey
  "held, no booking, no attendance" treatment on the coach calendar
  ([components/coach-calendar.tsx](components/coach-calendar.tsx),
  [dashboard-client.tsx](<app/(coach)/coach/dashboard/dashboard-client.tsx>)):
  `cancelled-no-notice` is one of `lib/payroll/calculate.ts`'s
  `PAID_STATUSES` (a genuine late cancellation still compensates the
  coach), and a pause explicitly should not. `'paused'` is simply never
  added to that list, so it's unpaid by construction — no special-case
  branch in payroll needed.
- [app/api/admin/set-pause-status/route.ts](app/api/admin/set-pause-status/route.ts) —
  now, on pausing, finds every `'scheduled'` session in the pause
  window and flips it to `'paused'`. Any makeup credit one of those
  sessions had spent gets reinstated (`used: false`,
  `used_session_id: null`) — same reinstatement
  [lib/booking/cancel-session.ts](lib/booking/cancel-session.ts) already
  does for a within-notice cancellation, so a credit is never silently
  lost to a pause.
- **Booking blocked while paused**
  ([app/api/booking/book/route.ts](app/api/booking/book/route.ts)) —
  there was no check at all before; a paused student's self-service
  booking (including spending a makeup credit) now 403s with "Your
  account is paused — sessions and makeup credits can't be booked until
  you're active again." Admin can still override (same "admin ⊇
  student" exemption this route already had for the credit-required
  rule).
- **Cycle-cap counts** (student dashboard, coach snapshot, admin
  overview's "today's schedule") all now exclude `'paused'` sessions the
  same way they already excluded both cancelled statuses — a held
  session was never actually used, so it shouldn't count against the
  4-per-cycle cap or show as a real session happening today.
- **Unaffected on purpose:** `expires_at` on an untouched (not-yet-
  booked) makeup credit is never touched by any of this — it still
  expires on schedule whether the student is paused or not, matching
  what you described. Un-pausing doesn't retroactively un-hold past
  `'paused'` sessions either — same "a cancelled slot never silently
  reappears" principle `materializeRecurringSessions` already applies
  to every other cancellation; if admin resumes early and wants a
  specific already-held slot back, that's a manual rebook via "Book a
  session," not automatic.
- Not separately re-verified in the interactive mock — this round is
  entirely session-status/booking-eligibility backend behavior with no
  new admin-student-page UI; type-checked clean, verified by reading
  every place `cancelled-no-notice` is already handled and mirroring it
  for the new status everywhere that logic needs to agree (payroll
  being the one deliberate exception).

**Unpause date now actually does something — click-tested in the
mock.** The pause form's "To" field already existed, but nothing ever
read it to auto-resume the student; admin had to remember to come back
and click Unpause by hand. Now:
- New `autoResumeExpiredPauses()`
  ([lib/scheduling/recurring.ts](lib/scheduling/recurring.ts)), called
  at the start of every daily `materialize-recurring` cron run (before
  it generates new sessions, so a student whose pause just expired
  starts refilling on the same run) — flips anyone whose `paused_end`
  has passed back to `active` and clears both pause fields, same as a
  manual Unpause.
- The already-paused view on the Pause panel now has its own editable
  "Unpause on" date, separate from the immediate "Unpause now" action —
  admin can set or change a scheduled resume date without fully
  unpausing and re-pausing. Saving it re-POSTs to the same
  [set-pause-status](app/api/admin/set-pause-status/route.ts) endpoint
  with the existing `pausedStart` and the new `pausedEnd`.
- The daily cron cadence (`0 10 * * *`, ~6am ET —
  [.github/workflows/materialize-recurring.yml](.github/workflows/materialize-recurring.yml))
  means auto-resume has up to ~24h latency, not minute-precision — fine
  for a date-only field, but worth knowing if a same-day resume is ever
  needed (use "Unpause now" for that).

**Staff Notes moved beside the student info card, top of page** — was a
full-width panel at the very bottom, now sits in a two-column row next
to Email/Membership/Coach/etc, reusing the same `.overviewGrid`
1.4fr/1fr responsive pattern already used on the admin Overview page
(stacks to one column under 900px). Click-tested at desktop width in
the mock.

**Admin Overview mock refreshed — no real code changes, this was a
stale-preview cleanup.** You asked to see it again; it still had the
old gold `--admin-accent` styling from before the purple revert, and
its Needs Attention examples predated the cancellation-flag work. Now
purple throughout (elite tier kept its own distinct amber, same as the
real `TIER_COLORS.elite` literal), and the Needs Attention list
demonstrates all three cancellation sources side by side — student
self-service ("Submitted via form"), admin-flagged via the Stop panel,
and Kajabi-detected. Also made the Students preview table's names
clickable (previously inert `<td>` text) — they open the student
detail mock, same fix applied to the Needs Attention "Review" links and
row names on the other mock earlier. Republished to the same
[admin overview](https://claude.ai/code/artifact/22399261-3cad-4d5e-b804-f9e3893dfb32)
link rather than creating a new one. Full click-test: resolved an item
from the Overview preview, opened Needs Review, moved items between
tabs — all still work exactly as before, this was a palette + content
refresh only, not a rebuild.

### Scheduler tab — retired
Reviewed first (see the old preview note below, kept for history), parked,
then you asked for suggestions once Coaches tab had grown into a full
scheduling/management surface. The honest read: Coaches tab's per-coach
Week mode already reuses `components/coach-calendar.tsx` verbatim, so
picking one coach there gives Day/Week/Month "for free" — the exact
browsing experience Scheduler offered, plus metrics, click-to-book,
click-to-cancel, availability editing, and coach add/remove that Scheduler
never had. Nothing Scheduler could do was missing from Coaches tab. Gave
you three options (parity build-out / retire / keep deliberately
lightweight) — you chose **retire**.

Removed: `app/(admin)/admin/schedules/page.tsx` and `schedules-client.tsx`
(confirmed nothing else imported them — `CoachCalendar` and
`AddCoachBlockForm` are shared with Coaches tab, so nothing's orphaned),
the "Scheduler" entry in [app/(admin)/admin-nav.tsx](<app/(admin)/admin-nav.tsx>).
Repointed two "go look at the coach calendar" links that used to point at
`/admin/schedules` — [dashboard/page.tsx](<app/(admin)/admin/dashboard/page.tsx>)'s
"View coach schedules →" and [overview/page.tsx](<app/(admin)/admin/overview/page.tsx>)'s
"Full week →" — to `/admin/coaches` instead. No redirect shim added for
the old URL (small internal tool, one operator, not a public app with
bookmarks to protect) — `/admin/schedules` now 404s, expected.
`npx tsc --noEmit -p .` clean, no dev-server errors.

The old review-pass artifact
([admin scheduler preview](https://claude.ai/code/artifact/0a0c2ab3-b200-432e-9dfe-a3be06e0a916))
is now stale/obsolete — it shows a page that no longer exists, kept only
as a historical record of what was reviewed before the retire decision.

### Coaches tab — rebuilt from a read-only roster into a working day-scheduler
The old page (name/email/timezone/**rate**/students/visibility table,
nothing clickable) is gone. New primary view: every coach as a column,
one day at a time, same slot-color language as the Scheduler page
(Available/Scheduled/Trial/Group/Blocked/Held). Mock, click-tested end
to end: [admin coaches preview](https://claude.ai/code/artifact/63e21465-1173-41c1-81a2-a46cbd377eae).

- **Pay rate removed from view, per your ask** — `page.tsx` no longer
  even selects `hourly_rate`. Still exists on `coaches` and still drives
  Payroll; just never rendered here anymore.
- **New bulk endpoint**
  [app/api/admin/all-coaches-day/route.ts](app/api/admin/all-coaches-day/route.ts) —
  every coach's sessions/blocks/group-lessons/held-slots for one day at
  once (loops the same per-coach shape
  [coach-schedule](app/api/admin/coach-schedule/route.ts) already
  returns, so the two stay trivially in sync).
- **Click an open slot → book with a makeup credit, or block it** — you
  confirmed "click any open slot" over "click an existing block." Books
  through the *existing* `/api/booking/book` (already supported
  admin-on-behalf-of + `makeupCreditId`, nothing new needed there) via a
  new student-search-then-credit-pick panel, backed by a new
  [app/api/admin/students-with-credits/route.ts](app/api/admin/students-with-credits/route.ts)
  (only lists students who actually have an unused, unexpired credit —
  nothing else to pick). "Block this time instead" is the same action
  for a single 30-minute slot.
- **Vacation / longer time off** — same
  `/api/admin/coach-blocks` a single-slot block uses, just a longer
  start/end range; the form itself
  ([components/add-coach-block-form.tsx](components/add-coach-block-form.tsx))
  is now a **shared** component instead of living only in
  `schedules-client.tsx` — the Scheduler page was quietly switched to
  use the same one, so there's one block-creation form, not two
  drifting copies.
- **New: editable weekly availability** — didn't exist in any form
  before. Per-day, per-window editor (`+ Add window` / `Remove`,
  multiple windows per day supported since `working_hours` already
  allows it) posting to new
  [app/api/admin/coach-working-hours/route.ts](app/api/admin/coach-working-hours/route.ts).
- **Real gap caught before it shipped:** `coaches` has only ever had
  SELECT policies (checked all the way back through migration 0022) —
  **no UPDATE policy existed at all**. Without catching this, the
  working-hours save would have silently written to zero rows (Supabase
  doesn't surface an RLS-blocked update as an error) and looked like it
  worked. New migration
  [0041_admin_coach_updates.sql](supabase/migrations/0041_admin_coach_updates.sql)
  adds `is_admin()` UPDATE access.
- Trimmed roster (Name/Email/Timezone/Students/Visibility, no Rate)
  still sits below the grid for reference — same click-test as before,
  just missing the Rate column now.

**Coach filter + Week view added, same day.** All-coaches columns is
now one mode, not the only one:
- New pill row — "All coaches" or a specific coach. Picking a coach
  narrows the grid to that one column (the grid-rendering code didn't
  need to change at all for this — it already just renders however many
  schedules it's given, so filtering the array to one entry falls out
  for free).
- **Week only offered once one coach is picked** — matches what you
  asked for exactly ("only select 1 coach"). Rather than build a second
  week-grid renderer, single-coach Week mode reuses the *exact* same
  [components/coach-calendar.tsx](components/coach-calendar.tsx) the
  Scheduler page already runs — same component, same
  `/api/admin/coach-schedule` endpoint, so it also comes with Month for
  free (not asked for, but free from reuse rather than new scope) and
  never drifts from Scheduler's own behavior. "Edit availability"/"Add
  time off" move up next to the Day/Week toggle in that mode, since the
  per-column header buttons the day-grid uses don't exist inside
  `CoachCalendar`.
- Picking "All coaches" always snaps the view back to Day — Week has no
  meaning across multiple coaches (would need coaches × 7 columns).
- Click-tested: narrow to one coach → grid drops to a single column →
  switch to Week → shows that coach's real week grid → back to All
  coaches → resets cleanly to the 3-column day view.

**Week prev/next-arrow question — already worked, no code change needed.**
You asked for ←/→ on Week view to move between weeks. Turns out
`CoachCalendar` already has its own ←/Today/→ nav built in (it's had
this since it was written for the coach dashboard/Scheduler) — its own
`anchorKey` state moves ±7 days in week mode, completely independent of
the outer page's day-view date. Since single-coach Week mode reuses that
component wholesale, this already worked in the real app; the gap was
only in the mock, which had a hand-rolled week grid with zero nav
controls. Fixed the mock: added its own ←/Today/→ (separate state from
the day view's, matching the real component's independence), navigating
shows the correct date range in the header and an empty grid for weeks
with no demo data (rather than fabricating events for a week that
hasn't happened).

**Add/remove coach — built.** You also asked how this interacts with
Kajabi. Short answer: **it doesn't, at all.** Checked
[app/api/webhooks/kajabi/route.ts](app/api/webhooks/kajabi/route.ts) —
Kajabi only ever fires for *student* purchases; there's no coach concept
on Kajabi's side whatsoever (no `kajabi_customer_id`-equivalent field on
`coaches`, nothing in the webhook that touches the `coaches` table).
Coaches have always been pure internal staff, admin-provisioned
directly — this just builds the UI/API for that, mirroring
[app/api/admin/provision-student/route.ts](app/api/admin/provision-student/route.ts)'s
manual (non-Kajabi) path almost exactly:
- New [app/api/admin/provision-coach/route.ts](app/api/admin/provision-coach/route.ts) —
  admin-only, inserts a `coaches` row, creates the Supabase auth user +
  `profiles` row (role `coach`), then emails a portal login link via the
  same `generateLink`-and-send-it-yourself pattern
  `app/api/auth/kajabi/login/route.ts` already uses for students
  (reused for consistency, not because Kajabi is involved).
- **Never a hard delete.** `sessions`, `coach_blocks`, `homework_notes`,
  payroll rows all reference `coaches.id` with real history that must
  survive. "Remove" sets a new `active` boolean to `false` instead —
  drops the coach from every *new*-assignment picker (assign-coach,
  provision-student, admin booking, reassign-session-coach, the Coaches
  page's own day/week grid) while every past record stays exactly as it
  was. New migration
  [0042_coach_active_status.sql](supabase/migrations/0042_coach_active_status.sql)
  adds the column; the existing `0041` admin-UPDATE policy already
  covers writing to it.
- New [app/api/admin/coach-active/route.ts](app/api/admin/coach-active/route.ts) —
  toggles it, admin-only.
- Coaches page: "+ Add coach" next to the filter pills opens a form
  (name/email/timezone/hourly rate); roster table gets Status +
  Remove/Reactivate columns. Removing a coach with assigned students
  shows a confirm warning (reassign separately — removing only stops
  new bookings) rather than silently orphaning them.
- `npx tsc --noEmit -p .` clean. Click-tested in the mock: added a
  coach → appears in pills + roster; removed a coach with 0 students →
  drops from pills/grid, roster shows Inactive/Reactivate. (The
  confirm-dialog warning path for removing a coach *with* students is
  real-code-only — the mock's `window.confirm` auto-cancels under
  browser automation, so that specific branch wasn't click-tested, only
  read-verified.)

**Multi-coach selection + view-scoped metrics, same day.** Two more asks:

- *"Select multiple coaches, view side by side"* — the coach filter pills
  went from single-select to toggle-each-on-its-own multi-select
  (`selectedCoachIds: Set<string>` in
  [all-coaches-day-client.tsx](app/(admin)/admin/coaches/all-coaches-day-client.tsx)
  instead of a single id). Day view's grid already just renders however
  many schedules it's handed, so picking e.g. Jordan + Sam needed no
  grid changes — the columns fall out for free, same as narrowing to one
  coach did originally. Week still requires narrowing to exactly one
  coach (unchanged reasoning: coaches × 7 columns stops being readable
  past one) — picking a second coach while in Week silently drops back
  to Day rather than erroring.
- *Metrics boxes below the calendar* — attended / no-shows / DNC
  students seen / schedule utilization, scoped to whatever's actually on
  screen: the day view's date + whichever coaches are selected (or all
  active, if none), or — for Week — the exact range `CoachCalendar` is
  currently showing. That range lives in `CoachCalendar`'s own private
  `anchorKey` state, not the parent's; wiring it out only needed a
  callback prop, `onRangeChange`, which **already existed** — it was
  built earlier for My Schedule's payroll summary
  ([app/(coach)/coach/schedule/schedule-client.tsx](app/(coach)/coach/schedule/schedule-client.tsx))
  and nothing here needed to touch `CoachCalendar` itself.
  - New [app/api/admin/coach-metrics/route.ts](app/api/admin/coach-metrics/route.ts) —
    takes `coachIds` (empty = all active) + `start`/`end`, returns
    attended/no-show counts (`sessions.status`), distinct DNC students
    seen (`students.payment_status = 'dnc'`, joined off the sessions in
    range — group-lesson attendees' DNC status isn't counted, kept out
    of scope), and utilization. Utilization walks each coach's
    working-hours windows day by day (same approach
    `app/api/booking/slots/route.ts` uses to find open slots): bookable
    minutes = working hours minus blocked time; occupied = time actually
    held by a session, group lesson, or a paused student's held slot. A
    with-notice cancellation doesn't count as occupied, matching
    booking/slots' own rule that it frees the slot back up.
  - Same posture as the sibling `all-coaches-day` route — RLS-gated, no
    explicit admin-role check in the route itself.
- `npx tsc --noEmit -p .` clean, no dev-server errors. Click-tested via
  the mock (the ref-based click tool got flaky/queued on this page mid-session
  — worked around by driving the exact same `onclick` handlers through
  the console instead, which exercises identical code paths): selecting
  Jordan + Sam → 2-column grid, metrics scope reads "Today — 2 coaches",
  numbers change to match just those two (DNC count correctly drops to 0
  since the DNC-flagged demo student isn't in that subset); narrowing to
  solo Jordan → Week becomes available, "This week" metrics; navigating
  to a future week zeroes out attended/no-show/utilization rather than
  fabricating activity for a week that hasn't happened yet.

**Bug report: availability/time-off "not working," booking-via-makeup
still unreachable, plus a new click-to-cancel ask.** You reported four
things — here's what each one turned out to be:

- *"Can't add windows, remove time on coach availability"* — the
  add/remove-window buttons themselves were never wired up in the
  **mock** (`openAvailability()` rendered plain `<button>`s with no
  `onclick` at all — a leftover from when that panel was a static
  preview). Fixed: the mock now keeps real per-coach demo state and the
  buttons actually add/remove/edit windows.
  Separately, on the **real app**: `app/api/admin/coach-working-hours/route.ts`'s
  `UPDATE` can be silently blocked by RLS and still report success — the
  exact failure mode migration
  [0041_admin_coach_updates.sql](supabase/migrations/0041_admin_coach_updates.sql)'s
  own comment already predicted, if that migration hasn't actually been
  run on your Supabase project yet. Hardened the route (and
  `app/api/admin/coach-active/route.ts`, same risk) to check
  `.select("id")` on the update and return a real 403 naming the
  migration if zero rows came back, instead of lying about success.
  **If you haven't confirmed migrations 0036–0042 are applied yet, that's
  almost certainly why this — and probably #3 below — aren't working on
  the real app.**
- *"Time off functionality not working... make it easy... maybe a small
  calendar popup"* — rebuilt
  [components/add-coach-block-form.tsx](components/add-coach-block-form.tsx):
  the two `datetime-local` fields (finicky, inconsistent calendar UI
  across browsers) are now a `type="date"` field (real native calendar
  popup) plus separate start/end time fields, with "All day" and
  "Multiple days" checkboxes so the common one-afternoon-off case stays
  two fields. Mock updated to match, including the same validation.
- *"Still can't click on coach availability to add a student makeup"* —
  the click-to-book handler itself was already correct
  (`cellState()` → `type: "available"` → `onClick` opens
  `BookWithCreditPanel`); if it's not working on the real app, the most
  likely explanation is upstream of this: no coach has any
  `working_hours` actually saved (same migration-0041 issue above), so
  every cell resolves to `"blank"`, not `"available"` — there's simply
  nothing to click yet. Also worth checking: `all-coaches-day` (and
  three other admin queries) now filter `coaches.active = true`
  (added when add/remove-coach shipped) — if migration
  [0042_coach_active_status.sql](supabase/migrations/0042_coach_active_status.sql)
  hasn't run yet, that column doesn't exist and those queries fail
  outright, which would also empty out the whole Coaches page. **Please
  confirm 0036–0042 are applied and let me know if this is still stuck
  once they are** — that'll tell us whether there's a second, different
  bug still to find.
- *"Click on the student and cancel or staff-cancel that lesson"* — new.
  Session cells in the day-grid are now clickable too (any coach, any
  scheduled session) and open a panel reusing the exact same
  [AdminCancelButtons](<app/(admin)/admin/students/[studentId]/admin-cancel-buttons.tsx>)
  component the student detail page already uses — same Cancel vs. Staff
  Cancel choice, same credit-cap preview, same audit logging. New
  [app/api/admin/student-cancel-caps/route.ts](app/api/admin/student-cancel-caps/route.ts)
  feeds it the monthly/yearly cap numbers on open (the student page
  already had these server-rendered; the grid doesn't, so it fetches
  them). `all-coaches-day` now also returns `is_makeup` per session so
  the panel's cap-remaining line only shows when it's actually relevant.

`npx tsc --noEmit -p .` clean, no dev-server errors. Click-tested the
mock via its console (the ref-based click tool got queued/flaky on this
page — same workaround as the multi-select session above, calling the
exact `onclick` handlers directly): add/remove-window state confirmed
correct; time-off's all-day/multi-day toggles show/hide the right
fields and block submission without a date; clicking a session opens
the cancel panel, Staff Cancel reveals the credit checkbox, and an empty
reason is rejected before the (stubbed) submit fires.

**Follow-up round — migrations confirmed through 0042, five more real
issues.** With the migrations actually applied, these turned out to be
genuine bugs (not the RLS gap from before):

- *"Availability update doesn't update the calendar; calendar is cut off
  at 5pm; coaches sometimes work midnight/1am."* One root cause: the
  day-grid's rows were a hardcoded 7am–8pm window
  (`ROW_START_MIN`/`ROW_END_MIN` module constants). Any working hours
  outside that range weren't clipped from storage — they were saved
  correctly — they just had no row to render into, so saving looked like
  it did nothing. Replaced with a `useMemo` in
  [all-coaches-day-client.tsx](<app/(admin)/admin/coaches/all-coaches-day-client.tsx>)
  that derives the row range from the actually-configured working hours
  of whoever's visible (30-min padding either side), falling back to
  7am–8pm only when nobody visible has any hours set yet. Same
  zoned-instant conversion `CoachCalendar` already uses for this exact
  problem, just computed once for the row bounds instead of per-cell.
- *"Booking/cancelling doesn't show up right away."* The refetch-after-
  action wiring was already correct, but it went through a `refreshTick`
  bump the effect picked up asynchronously — the panel closed before the
  new data had actually arrived, and worse, every refetch (including a
  plain date-nav click) blanked the whole grid to a loading message
  first. Fixed both: pulled the fetch into a `refetchSchedules()`
  function every action panel now `await`s *before* closing itself, and
  the grid no longer disappears on a background refresh — "Loading…"
  only shows on the very first load.
- *"I like the previous time-off version better... should be able to
  add a time, not just a date."* The all-day/multi-day toggle redesign
  from the last round defaulted to hiding the time fields, which is
  probably what read as "doesn't work" — you'd have to notice and
  uncheck a box first. Simplified
  [components/add-coach-block-form.tsx](components/add-coach-block-form.tsx)
  back to always-visible Start date/time + End date/time (4 fields, no
  hidden state) — keeps the real calendar-popup win from `type="date"`
  while matching the older, more direct shape.
- *"Need to cancel group classes too."* Group lessons had no
  cancellation concept at all — no status column, and no FK cascade on
  registrations, so a hard delete would either fail once anyone
  registered or destroy their attendance/payment history. New migration
  [0043_group_lesson_cancel.sql](supabase/migrations/0043_group_lesson_cancel.sql)
  adds `group_lessons.cancelled_at` (soft-cancel, same posture as
  session cancellation), new
  [app/api/admin/cancel-group-lesson/route.ts](app/api/admin/cancel-group-lesson/route.ts),
  and `getCoachGroupLessons` (in
  [lib/group-lessons.ts](lib/group-lessons.ts) — the one function
  feeding every calendar view) now excludes cancelled lessons, so this
  fix reaches the coach dashboard and Scheduler too, not just Coaches.
  Also excluded from payroll's needs-attendance query
  (`app/api/coach/payroll/route.ts`) so a cancelled lesson stops nagging
  the coach for attendance. Refunding a paid attendee is intentionally
  left manual (group-lesson payment was already manual/informal before
  this — no live Stripe integration, just a note field) rather than
  invented here. Click a group-lesson cell in the day-grid to cancel it.
- *"Buttons open an action box all the way at the bottom — make it more
  intuitive."* Every action panel (book, block, availability, time off,
  add coach, cancel, cancel-group) rendered inline at the bottom of the
  page flow, below the metrics and the full roster table — clicking
  "Availability" in a column header, or even "+ Add coach" up in the
  filter row, opened something invisible without scrolling. New
  `ModalOverlay` wrapper centers each one as a real fixed-position
  overlay with a dimmed backdrop instead (click the backdrop or the
  panel's own Close to dismiss) — no restructuring of the panels
  themselves, just where they render.

New migration **0043** needs the same confirm-it's-applied step as
0036–0042 before any of the group-lesson-cancel work will function.

`npx tsc --noEmit -p .` clean, no dev-server errors. Click-tested the
mock (console-driven, same reason as above): narrowing from all 3
coaches to just Jordan Lee shrinks the row range from 8:30 AM–11:30 PM
down to 8:30 AM–5:00 PM (Priya's the only one with the late window);
booking a slot and cancelling both a session and a group lesson update
`EVENTS` and re-render in the same call, no separate refresh; the
time-off panel now shows all 4 fields with no hidden toggle; every
modal confirmed `position: fixed` and visible without scrolling.

**Availability lag fixed, plus effective-dated schedule changes.** Two
more asks, after confirming migrations through 0043 were applied (so
the earlier RLS theory was ruled out for this one):

- *"Availability did not work or populate right away"* — the refetch-
  after-save wiring itself was already correct (confirmed by rereading
  it), but it still had to round-trip to the server before the panel
  closed. `AvailabilityPanel`'s `onSaved` now hands the just-saved hours
  straight back to the parent, which patches the grid's local state
  synchronously — the calendar reflects a save on that exact click, no
  network gap. The background refetch/`router.refresh()` still run, just
  to reconcile rather than to gate the UI update.
- *"Add when is the effective date of schedule changes"* — this one
  turned out to have two very different sizes depending on what "future
  hours" should mean before the date arrives, so I checked with you
  first: **old hours stay live until the date, then switch** (the bigger
  option — a flat "just a timestamp" version would've been faster but
  wouldn't actually protect near-term bookings from a same-day change,
  which seemed to be the point). Built:
  - New migration
    [0044_pending_working_hours.sql](supabase/migrations/0044_pending_working_hours.sql) —
    `coaches.pending_working_hours` / `pending_effective_date`. Only one
    queued change tracked at a time; saving (immediate or future) always
    replaces whatever was previously pending.
  - New shared resolver
    [lib/scheduling/working-hours.ts](lib/scheduling/working-hours.ts) —
    `resolveWorkingHoursForDate(coach, dateKey)`, a plain function (no
    server-only deps, safe from a client component) that picks pending
    vs. current hours for one specific date. Every place that walks a
    date range now calls it **per day** rather than resolving once for
    the whole request — the entire point of an effective date is that a
    week or month straddling it shows old hours on one side and new on
    the other, not one version bleeding across the transition.
  - Touched every reader that previously read `coaches.working_hours`
    directly: `app/api/admin/coach-working-hours/route.ts` (now accepts
    `effectiveDate`, branches immediate-write vs. pending-write),
    `app/api/admin/all-coaches-day/route.ts` (resolves once, server-side,
    since it always fetches a single specific day),
    `app/api/admin/coach-schedule/route.ts` and
    `app/api/coach/schedule/route.ts` (pass `pendingWorkingHours`/
    `pendingEffectiveDate` through raw, since these feed `CoachCalendar`
    across a whole week/month), `app/api/booking/slots/route.ts` and
    `app/api/admin/coach-metrics/route.ts` (both already walked day by
    day — resolve inline in that loop).
  - **`components/coach-calendar.tsx`** — the riskiest edit, since it's
    shared by the coach's own dashboard and Coaches tab's Week mode. Its
    row-range `useMemo` and its `cellState` working-hours check both now
    resolve per actual calendar date instead of a flat day-of-week map.
    No behavior change for a coach with no pending change (resolver just
    returns `workingHours` untouched); a transition week now correctly
    shows old hours before the effective date and new hours on/after it.
  - **`AvailabilityPanel`** — new "Effective date" field (defaults to
    today = immediate, min date = today). If a change is already queued,
    opening the panel edits *that* queued version by default (not the
    live hours) with a banner + a "discard it and edit today's live
    hours instead" link — editing blind to an existing queued change
    felt like the likelier bug than the extra state. Roster table shows
    a small "Hours change scheduled: [date]" badge per coach.
  - Deliberately **not** built: any admin-visible history of past
    changes, more than one queued change at a time, or a cron job — none
    of that was asked for, and the pending/current pair already does
    the promotion implicitly (via the date comparison) rather than
    needing one.
  - `npx tsc --noEmit -p .` clean, no dev-server errors. Click-tested via
    the mock (draft-based editing added there too — previously the demo
    mutated the "live" hours as you typed, which doesn't work once
    editing an immediate change and a future one are different
    actions): future-dated save leaves the live hours (and the grid)
    untouched; reopening shows the queued draft with the banner;
    discarding reverts to live hours; an immediate save applies right
    away and clears the roster badge.

**Week view now always shows the full 24 hours.** Quick follow-up: Week
mode's row range was still computed from actual working hours (padded
±30 min) same as Day view — reasonable for Day, but in Week it meant a
coach with unusual hours (or one whose hours vary a lot day to day)
could have real slots quietly clipped off-screen. Week now always shows
12:00 AM–11:59 PM regardless of what's configured; Day and Month are
unchanged (still the tighter, padded-to-actual-hours range — that one
wasn't the complaint). One-line change in
[components/coach-calendar.tsx](components/coach-calendar.tsx)'s row-range
`useMemo` — short-circuits to the full range when `view === "week"`
before doing any per-day resolution. Since `CoachCalendar` is shared,
this applies everywhere Week mode shows up (coach's own dashboard,
Coaches tab's per-coach Week toggle) with no per-consumer changes needed.
`npx tsc --noEmit -p .` clean, no dev-server errors. Mock's
`renderWeekGrid` updated to match and click-tested: 48 rows, 12:00 AM
through 11:30 PM regardless of the selected coach's configured hours.

**Week view is clickable now too — book/cancel, not just browse.**
Immediate follow-up: `CoachCalendar` (the component Week mode reuses) had
never supported anything beyond `canMarkAttendance`'s past-session
marking — no click-to-book, no click-to-cancel. That's exactly what the
Coaches page's separate Day-grid already has, so this was a real gap
between the two views of the same page, not a new idea. Extended
`CoachCalendar` itself (the direction picked earlier when discussing
Scheduler's retirement) rather than duplicating the Day-grid's click
logic a second time:

- Three new optional props —
  `onAvailableSlotClick`/`onSessionCancelClick`/`onGroupLessonCancelClick` —
  all default `undefined`, so the coach's own dashboard (which passes
  none of them) renders identically to before. `Session`/`GroupLesson`
  are now exported types so a consumer can type its callbacks against
  them.
- `cellState`'s "available" branch now also returns the resolved
  `slotStart`, needed for the booking callback.
- Wired in `all-coaches-day-client.tsx`'s Week-mode `<CoachCalendar>` to
  the exact same `book`/`cancel`/`cancelGroup` panels the Day grid
  already opens — same `BookWithCreditPanel`, `CancelSessionPanel`,
  `CancelGroupLessonPanel`, no new UI built.
- `Session` gained `isMakeup` (needed by `AdminCancelButtons`, which the
  cancel panel already wraps) — `app/api/admin/coach-schedule/route.ts`
  and `app/api/coach/schedule/route.ts` both now select and return
  `is_makeup`, a gap flagged during the earlier Scheduler research but
  not worth fixing until something actually needed it.
- Real bug caught while wiring this up: booking/cancelling from Week
  mode bumped the Day-grid's local state but never touched
  `CoachCalendar`'s own independent fetch (it refetches off
  `refreshSignal`, not the parent's `schedules` state) — so Week's grid
  wouldn't have updated after its own actions. Every `onDone`/`onSaved`
  callback now also bumps `refreshTick` (already wired to
  `refreshSignal`) alongside the existing `refetchSchedules()`, so
  whichever view is actually on screen gets fresh data either way.
- `npx tsc --noEmit -p .` clean, no dev-server errors. Mock's
  `renderWeekGrid` gained the same clickability, working-hours-aware
  blank cells (a day/time outside the coach's hours no longer renders as
  bookable), and day-tagged event mutation so cancelling in Week doesn't
  reach into the Day view's separate demo data. Click-tested: booking an
  open Tuesday slot and cancelling Monday's session both update
  `WEEK_EVENTS` and re-render immediately; cancelling a group lesson
  removes it; a blocked cell stays non-clickable; a late-night cell
  outside working hours renders blank, not available.

**Row-range walked back to consistent, not full-24h — plus a bounded,
scrollable calendar.** You tried the full-24-hour Week grid from the
previous change and it felt wrong: mostly empty, and — the real
issue — inconsistent with Day view, which still used a padded-to-actual-
hours range. Asked for one rule everywhere: earliest start to latest end
across a coach's whole week, regardless of Day, Week, single-coach, or
All-coaches.

- Reverted `CoachCalendar`'s Week-specific full-24h branch — its
  row-range `useMemo` already computed exactly this (whole-week union,
  per-date resolved for effective-date correctness) for Day; it now
  applies unconditionally, so Day and Week always agree.
- The Coaches page's own grid (`all-coaches-day-client.tsx`) previously
  computed its range from only *today's specific weekday* — different
  scoping from `CoachCalendar`'s whole-week union, which was the actual
  inconsistency between the two. Rewrote it to scan all 7 days the same
  way (new local `startOfWeekKey` helper), so a coach's grid looks
  identical whether it's this page's Day columns or `CoachCalendar`'s
  Day/Week for that same coach.
- Added a bounded, scrollable container (`max-height: 560px`,
  internal scroll, rounded border) around both grids — "the box is so
  long" doesn't fully go away just from a tighter range (a coach with a
  wide legitimate span, e.g. 6am–11pm, is still a lot of rows), so this
  caps it regardless of how wide any given coach's hours are, rather
  than letting the calendar push the rest of the page down indefinitely.
- `npx tsc --noEmit -p .` clean, no dev-server errors. Mock's
  `computeDayRowRange` renamed to `computeRowRange` and rewritten to
  scan a coach's whole `WORKING_HOURS_DEMO` map instead of just `"wed"`,
  used by Day, Week, *and* week metrics' utilization calc for the same
  reason. Click-tested: Jordan Lee's Day and Week now both show the
  identical 8:30 AM–5:00 PM (18 rows); "All coaches" widens to
  8:30 AM–11:30 PM since Priya's late window pulls the union wider; the
  grid wrapper confirmed capped at 560px with `overflow-y: auto`.

### Finance tab — restyled from the orphaned Payroll page, re-added to nav
Confirmed with you first: no real dollar revenue data exists anywhere in
this app (Kajabi tiers are synced as plan-name labels only, zero price
mapping in the DB/types/webhook — verified by grepping for
"revenue"/"mrr"/"price_cents" etc. across `app`/`lib`, zero hits). So this
is a **restyle of the existing payroll cost dashboard**, not a new
revenue-side build — the only real currency in the app is coach
`hourly_rate`, which the old Payroll page already computed correctly.

- Moved `app/(admin)/admin/payroll/` → `app/(admin)/admin/finance/`
  (`page.tsx` now `AdminFinancePage`, `payroll-client.tsx` →
  [finance-client.tsx](<app/(admin)/admin/finance/finance-client.tsx>) →
  `FinanceClient`). Backend untouched — still hits
  `/api/admin/payroll/{rollup,history,generate,mark-paid,export}`, an
  internal detail not worth renaming alongside a page move.
- Re-added to [admin-nav.tsx](<app/(admin)/admin-nav.tsx>)'s `MORE_LINKS`
  section (alongside Exercises/Group Lessons — same reasoning, real
  built feature with no slot in the 6-item mockup nav), `$` icon.
- Added a `statCardsRow` of 4 summary cards (Live rollup this range /
  Finalized this range / Paid / Unpaid) above the existing date-range
  and table panels — same `overviewCard` pattern the Overview page
  already established, reused rather than inventing a new stat-card
  style. Unpaid card goes coral (`overviewCardValueWarn`) when > $0.
- `npx tsc --noEmit -p .` clean (had to clear a stale `.next/types`
  cache pointing at the old `payroll/page.tsx` path first). Verified
  via a new interactive mock (expand/collapse a coach's session rows,
  coach filter narrows both the rollup table and stat cards together,
  generate-run confirm → "N entries added", mark-paid toggle updates
  the Paid/Unpaid cards live):
  [admin finance preview](https://claude.ai/code/artifact/914b91be-0183-4057-99ed-043e696cf672).

**Monthly attendance-check workflow, editable coach rates, and referral
bonus — same session, real workflow you described:** payroll runs on the
1st for the previous full calendar month; before generating, you check
for sessions nobody marked attendance on, notify coaches, then run once
clean. Built:

- **Default date range flipped from month-to-date to the previous full
  calendar month** (`previousMonthRange()` in
  [finance-client.tsx](<app/(admin)/admin/finance/finance-client.tsx>)) —
  opening Finance on Sep 1 now defaults to Aug 1–31, not Sep-so-far.
- **New "Attendance check" panel**, between Date range and Live rollup —
  lists, per coach, how many sessions in range are still sitting at
  `'scheduled'` status despite their time having passed (new
  `findUnrecordedAttendance()` in
  [lib/payroll/calculate.ts](lib/payroll/calculate.ts), new
  [unrecorded-attendance/route.ts](app/api/admin/payroll/unrecorded-attendance/route.ts)).
  This matters because `computeCoachPayroll`'s `PAID_STATUSES` filter
  already silently excludes any session still stuck at `'scheduled'` —
  no error, it just quietly doesn't get paid — so this surfaces the gap
  instead of leaving you to notice it never happened. Deliberately scoped
  to 1:1 `sessions` only, not group lessons: group-lesson pay is gated on
  elapsed time, not a per-attendee attendance mark (unchanged from
  before), so there's nothing to catch there.
- **"Notify coaches" button** posts one Slack message (existing
  `notifySlack()`, [lib/slack/notify.ts](lib/slack/notify.ts) — same
  webhook as coach-block alerts) listing every coach with unmarked
  sessions and a count, via new
  [notify-attendance/route.ts](app/api/admin/payroll/notify-attendance/route.ts).
  Recomputes server-side rather than trusting the client's last fetch.
- **Not a hard gate** — Generate payroll run still works with unrecorded
  sessions present (an admin might legitimately want to run partial
  payroll and pick up the rest later; regenerating the same range after
  attendance gets marked correctly adds the newly-payable sessions,
  since `payroll_entries` dedupes by `session_id`). Instead, the confirm
  dialog shows a coral warning line naming the count when it's nonzero,
  so it can't be missed at the moment that matters.
- **Coach rates now editable from Finance** — new "Coach rates" panel,
  click-to-edit per coach (same pattern as birth-date/coach-since: read-
  only text + Edit link + explicit Save/Cancel, nothing writes on blur).
  New [coach-rate/route.ts](app/api/admin/coach-rate/route.ts), same
  hardened zero-rows-means-403 pattern as `coach-active/route.ts` (relies
  on the existing "admins can update coaches" policy from migration
  0041 — no new migration needed for this part). Previously
  `hourly_rate` could only be set once, at coach provisioning.
- **Referral bonus** — a student can now be tagged "Referred by
  [coach]" on the admin student detail page (new
  [referral-client.tsx](<app/(admin)/admin/students/[studentId]/referral-client.tsx>),
  same click-to-edit pattern, new statRow next to "Coach"). New
  `students.referred_by_coach_id` column
  ([0045_referral_bonus.sql](supabase/migrations/0045_referral_bonus.sql) —
  **not yet confirmed applied**, see Action needed above), a nullable FK
  rather than a boolean flag, since the bonus needs to know *which*
  coach gets credit. New
  [set-referral/route.ts](app/api/admin/set-referral/route.ts) (RLS-only,
  no new policy needed — "admins can update all students" from 0007
  already covers every column on `students`).
  - The bonus itself: `REFERRAL_BONUS_PER_HOUR = 10` in
    [lib/payroll/calculate.ts](lib/payroll/calculate.ts) — applied as
    +$10/hr (= +$5/30min, same linear formula `payForSession` already
    used) on top of the coach's base rate, and **only** when the
    session's `actual_coach_id` matches the referred student's
    `referred_by_coach_id` — i.e. the bonus follows "this coach is
    currently teaching the student they referred," indefinitely, not a
    one-time payout on first booking. If a referred student gets
    reassigned to a different coach, the bonus stops (correctly — the
    new coach didn't refer them). Deliberately **not** applied to group
    lessons — there's no single "the student" on a class roster to
    check the referral against.
  - `PayableSession` gained an `isReferralBonus` flag; the Finance
    page's rollup line items show a small "referral +$10/hr" badge next
    to the student's name when it's set, so the bonus is visible, not
    just baked silently into the total. `payroll_entries.amount` already
    freezes the bonus-inclusive amount at generate time — no changes
    needed to generate/mark-paid/export/history routes, they all just
    pass the computed amount through.
- `npx tsc --noEmit -p .` clean. Click-tested in the refreshed
  [admin finance preview](https://claude.ai/code/artifact/914b91be-0183-4057-99ed-043e696cf672)
  (demo data reshaped to match the new previous-month default range):
  attendance check lists 2 coaches/3 unrecorded sessions, Notify coaches
  → "Slack message sent — 2 coaches, 3 sessions"; expanding Jordan Lee's
  row shows both of Ava Chen's sessions tagged "referral +$10/hr" at the
  bonus-adjusted amount ($21 vs. $16 base for a 30-min session);
  Generate's confirm dialog shows the coral unrecorded-attendance
  warning; editing Jordan's rate from $32 to $36/hr and saving updates
  the Coach rates table immediately.

### Admin-Finance role + Reports tab — new, same session
You asked for a Reports tab with revenue/margin/retention metrics,
"only accessible by this Admin-Finance user." First pass had the
boundary backwards — flagged and corrected once you clarified with a
screenshot: **`admin_finance` is a superset of `admin`**, not a
restricted subset. A plain "admin" (a different Kajabi library card, in
your words) sees everything *except* Finance (payroll) and Reports;
`admin_finance` sees literally everything, including those two. Also
dropped the invite-by-email UI entirely per "no need to add email" —
there's no in-app way to create an `admin_finance` account yet, you'll
set the role directly in Supabase (see Action needed above).

Two more decisions confirmed with you before building:
- **Tier pricing isn't synced from Kajabi** (still on the old platform)
  — you gave the actual monthly figures (lite free, suite $29.99, pro
  $399, elite $599, with unmodeled discounts for 3/6/12-month prepay),
  hardcoded as `TIER_PRICE_MONTHLY` in
  [lib/billing/tier-pricing.ts](lib/billing/tier-pricing.ts). Every
  dollar figure the Reports page shows is a **monthly-list-price
  estimate** derived from this, not a reconciled/collected-cash number
  — flagged inline on the page itself, not just here.
- **Built the full mockup as-is** — the two metrics needing real
  historical tracking that doesn't exist yet (Cohort Retention, Trial →
  Paid Funnel) are rendered with their real intended structure but a
  "Needs setup" badge and a plain-English note on exactly what schema/
  event-logging work would turn each on, per your ask to "know what to
  build in the future" rather than fabricating numbers.

**New role: `admin_finance`** — sees everything `admin` does, plus
Finance and Reports. Design:
- [0046_admin_finance_role.sql](supabase/migrations/0046_admin_finance_role.sql)
  widens `profiles.role`'s check constraint and, more importantly,
  **widens the `is_admin()` SQL function itself** to admit
  `admin_finance` — rather than hand-editing each of its ~18 individual
  policy call sites, this gives admin_finance the exact same DB-level
  access as admin on every table the two roles *share* (Overview,
  Students, Coaches, Needs Review, Community, Exercises, Group Lessons),
  with zero risk of missing one. Finance/Reports' own boundary can't be
  expressed that way — RLS has no clean way to say "sees a student's
  homework notes but not a coach's pay rate" without a much bigger
  policy rewrite — so it's enforced separately, at the application
  layer, both on the 2 pages and on Finance's own API routes (below).
- [lib/auth/require-role.ts](lib/auth/require-role.ts) — `requireRole`
  now accepts an array of roles and returns the resolved role (the
  (admin) layout calls `requireRole(["admin", "admin_finance"])` and
  passes the actual role to `AdminNav`). New `requireFinanceAccess()` —
  used at the top of [finance/page.tsx](<app/(admin)/admin/finance/page.tsx>)
  and [reports/page.tsx](<app/(admin)/admin/reports/page.tsx>) — redirects
  a non-`admin_finance` user back to Overview rather than to /login
  (which would incorrectly boot a legitimately logged-in admin).
- [admin-nav.tsx](<app/(admin)/admin-nav.tsx>) — Finance and Reports
  carry `financeOnly: true`; every other link is shared by both roles,
  unchanged from before this feature. Sidebar role label reads "Admin"
  vs. "Admin + Finance".
- **New [lib/auth/roles.ts](lib/auth/roles.ts)** — two helpers, for two
  different boundaries:
  - `ADMIN_ROLES`/`isAdminRole()` — the *shared* boundary. 7 routes had
    a hardcoded `role !== "admin"` check that would've 403'd
    admin_finance out of pages it has full parity on (widening
    `is_admin()` alone doesn't touch TypeScript-level checks):
    `coach-active`, `provision-coach`, `provision-student`,
    `exercises/assign`, `notes`, `booking/book`, `sessions/upcoming`.
    Found via `grep -rniE "role\s*(!==|===)\s*['"]admin['"]"` across
    `app/` — swept the whole tree, not just the routes expected to need
    it. `exercises/sync` deliberately kept exact-admin-only (both roles
    get Exercises, so no widening needed there either way).
  - `hasFinanceRole()` — the *money* boundary, `admin_finance` only.
    RLS alone won't stop a plain admin from hitting Finance's API
    routes directly and still getting real payroll numbers (is_admin()
    admits both roles) — so this is now an explicit check on all 7
    payroll routes (`rollup`, `history`, `generate`, `mark-paid`,
    `export`, `notify-attendance`, `unrecorded-attendance`) plus
    `coach-rate` (pay-rate edits specifically, not the rest of the
    Coaches page).

**New Reports page** ([page.tsx](<app/(admin)/admin/reports/page.tsx>)),
real numbers where derivable today:
- Active students, MRR, DNC count, coach utilization (reused
  `computeCoachMetrics` — see extraction below), gross margin, and a
  new "Outstanding unpaid payroll" stat (sum of every `payroll_entries`
  row not yet marked Paid, any period — ties directly into the Finance
  tab's own Paid/Unpaid cards).
- Revenue-by-tier bar (same `tierBar`/`tierLegend` visual language as
  the Overview page's tier-breakdown card, just dollar-weighted instead
  of headcount-weighted).
- Revenue-per-coach-vs-cost-per-coach table — revenue is each active
  coach's assigned roster at monthly list price, cost is real
  month-to-date payroll (`computeCoachPayroll`, reused as-is from
  [lib/payroll/calculate.ts](lib/payroll/calculate.ts)) — margin/margin%
  computed from those two, with an "Unassigned students" row for active
  students with no coach so the revenue total still reconciles.
- **Extracted `lib/admin/coach-metrics.ts`** from
  `app/api/admin/coach-metrics/route.ts` — the utilization-walking logic
  was inline in that route; Reports needed the same calc as a server
  component (no HTTP round-trip), so it's now a shared function both the
  route and the page call. Route itself is now a thin wrapper, verified
  no behavior change (same request/response shape).
- Cohort Retention and Trial → Paid Funnel — structural placeholders per
  above, each with a "Needs setup" badge and a specific note on what to
  build (a monthly active-student snapshot table for retention; a
  timestamped trial-stage event log for the funnel — currently only
  `unbookedTrials`' current-moment entitlement count exists, surfaced
  as a small real sub-stat next to the funnel's placeholder).
- `npx tsc --noEmit -p .` and `next build` both clean (build also
  confirms `/admin/reports` and every route compile — a stronger check
  than tsc alone given the size of this change). Click-tested via a
  mock with a "view as" demo toggle (not part of the real app — role is
  set at login, this just simulates both without needing two real
  accounts):
  [admin reports preview](https://claude.ai/code/artifact/63db8e61-071f-4cfe-99e5-f3d1a51dcc16).
  Switching to "Admin (no Finance/Reports)" drops Finance and Reports
  from the sidebar and swaps the whole page for a note explaining the
  real redirect behavior (not just a hidden link — a direct URL hit
  actually bounces to Overview); switching back to "Admin + Finance"
  restores the full nav and the Reports content.

**Reports gained the same date-range + multi-coach filtering the
Coaches/Finance pages already have** — immediate follow-up, same
session. Whole page re-scopes together, not just the coach table:
- Converted Reports from a static server component to a client-driven
  one, matching Finance's own architecture. New
  [reports-client.tsx](<app/(admin)/admin/reports/reports-client.tsx>)
  owns `startDate`/`endDate` plus a `selectedCoachIds: Set<string>`
  (empty = all coaches) — same toggle-each-pill multi-select pattern as
  the Coaches page's coach filter, reusing the `lifecycleBtn`/
  `lifecycleBtnActive` classes rather than inventing new pill CSS.
  [page.tsx](<app/(admin)/admin/reports/page.tsx>) is now just the
  `requireFinanceAccess()` guard + the coach list for the pills.
- **Extracted `lib/admin/reports.ts`**'s `computeReportsSummary()` —
  all the computation that used to live directly in page.tsx, now
  parameterized on `(rangeStart, rangeEnd, coachIds)` and called from a
  new [reports/summary/route.ts](app/api/admin/reports/summary/route.ts)
  (finance-gated via `hasFinanceRole()`, same posture as every other
  Finance API route) that `reports-client.tsx` fetches from on every
  filter change.
- **Deliberate split on what actually moves with the date range**:
  active students / tier mix / MRR / DNC / revenue-by-tier are "right
  now" roster snapshots — there's no historical tracking yet to answer
  "MRR as of last March" (that's exactly what Cohort Retention's "Needs
  setup" note is about), so the date range only moves the numbers that
  really are period-based: coach utilization, payroll cost, margin, and
  outstanding unpaid payroll (which now also filters to entries whose
  period overlaps the selected range, not "any period" like the very
  first version — a deliberate consistency choice once the page as a
  whole became range-filterable).
- **Coach scoping**, once specific coaches are selected: active
  students/MRR/DNC/revenue-by-tier recompute from just those coaches'
  assigned active rosters; the "Unassigned students" row on the
  coach table disappears (a student with no coach was never going to be
  in a specific-coach selection, so keeping that row would just be
  confusing); utilization scopes to the selected coach(es) via
  `computeCoachMetrics`' existing `coachIds` parameter (already
  supported it, just wasn't wired up from Reports before now).
  Org-wide-only numbers (pending-trial count) stay unscoped and are
  labeled "org-wide" so that's not mistaken for a bug.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested in
  the same
  [admin reports preview](https://claude.ai/code/artifact/63db8e61-071f-4cfe-99e5-f3d1a51dcc16)
  (republished with working filters, not just the role-switch demo):
  selecting Nikki alone scopes every stat card and the coach table down
  to her roster, the Unassigned row disappears, and utilization becomes
  her own 88% rather than the org average; adding Celine sums both
  coaches' numbers correctly (revenue/cost/margin/unpaid all reconcile
  against the Total row); narrowing the date range recomputes payroll
  cost and margin while leaving the roster-snapshot numbers (students,
  MRR, DNC) untouched, as designed.

**Finance: manual payroll adjustments (bonus/deduction)** — immediate
follow-up, same session. You asked to "clean up" Finance and add manual
adjustments; the date-range picker you also asked for already existed
(added earlier this session, previous-full-month default) — the
adjustment form just reuses it rather than adding a second one, so a
bonus/deduction is always filed under whatever range is currently
selected.
- New migration
  [0047_payroll_manual_adjustments.sql](supabase/migrations/0047_payroll_manual_adjustments.sql) —
  `payroll_entries.is_manual`/`reason`, and the existing
  session-xor-group-lesson check constraint widened to a third case
  (both null, `is_manual = true`). Reused `payroll_entries` rather than
  a parallel table, so Finalized entries/export/mark-paid all keep
  working for this new row shape with small additions, not a rewrite.
- **A manual adjustment skips the live-rollup/generate-run step
  entirely** — unlike a session or group lesson, there's no "unfrozen"
  computed state to preview; the moment admin adds one it's already a
  real, finalized `payroll_entries` row (`paid: false`, same mark-paid
  flow as everything else). New
  [add-adjustment/route.ts](app/api/admin/payroll/add-adjustment/route.ts)
  (finance-only, `hasFinanceRole()`) and
  [remove-adjustment/route.ts](app/api/admin/payroll/remove-adjustment/route.ts) —
  the latter scoped to `is_manual = true` only, so it can never delete a
  real session/group-lesson entry (removing a bad one of those is a
  session-status fix, not a payroll action).
- **Sign convention**: `amount` can now be negative (a deduction) —
  the Finance UI takes a Bonus/Deduction dropdown + an always-positive
  number so admin never has to type a minus sign, and applies the sign
  before sending. New `money()` helper in
  [finance-client.tsx](<app/(admin)/admin/finance/finance-client.tsx>)
  renders negative amounts as `-$X.XX` in coral rather than a
  double-negative `$-15.00`.
- [history](app/api/admin/payroll/history/route.ts)/
  [export](app/api/admin/payroll/export/route.ts) routes gained a third
  branch (`is_manual` → type `"adjustment"`, label = the reason text) —
  the "Student / Topic" column is now "Details" since it covers all
  three entry types. Finalized entries rows show a small "adjustment"
  badge and, only for manual rows, a coral "Remove" link.
- `npx tsc --noEmit -p .` and `next build` both clean (build confirms
  the 2 new routes compile). Click-tested in the refreshed
  [admin finance preview](https://claude.ai/code/artifact/914b91be-0183-4057-99ed-043e696cf672)
  (2 seeded demo adjustments — a $40 bonus and a -$15 deduction —
  plus live add/remove): submitting the form empty shows the inline
  validation error; adding a $50 "Holiday bonus" for Priya immediately
  appears in Finalized entries with the adjustment badge and updates
  the Finalized/Unpaid stat cards ($115.50 → $165.50); Remove drops it
  back to $115.50 and 6 entries.

**Generate payroll: confirmation popup + coach-visible summary — new,
same session.** You asked for clicking Generate to open a popup summary
and for each coach to see their share on their own dashboard.

- **Admin popup**: [lib/payroll/calculate.ts](lib/payroll/calculate.ts)'s
  `generatePayrollRun()` now returns a `perCoach` breakdown
  (`coachId, coachName, entries, total`) alongside the existing
  `inserted`/`skippedAlreadyPaid` counts — computed for free from data
  it already had in hand (the pre-insert `summaries`), cross-referenced
  against which rows the upsert *actually* inserted (its
  `ON CONFLICT DO NOTHING` already only returns fresh rows, so this
  needed no second query, just selecting `session_id`/`group_lesson_id`
  back alongside `id`). [finance-client.tsx](<app/(admin)/admin/finance/finance-client.tsx>)
  shows this in a real modal (`ModalOverlay`, same fixed-overlay pattern
  the Coaches page already uses for its own action panels) instead of
  the old one-line success text.
- **Coach-visible summary — this is a genuinely new mechanism, not just
  a UI addition.** Investigated first: every coach-facing surface in
  this app was previously pull-only (RLS-scoped data a coach's own page
  happens to query) — there was no precedent for "an admin action
  places something on a coach's dashboard unprompted," and `/coach/payroll`
  wasn't even in the coach nav (a real, separate gap, now fixed —
  `Payroll` added to [coach-nav.tsx](<app/(coach)/coach-nav.tsx>)).
  - New migration
    [0048_payroll_coach_seen.sql](supabase/migrations/0048_payroll_coach_seen.sql) —
    `payroll_entries.coach_seen_at`, null until a coach has actually
    had one returned to them. No new RLS policy: coaches have no
    UPDATE policy on `payroll_entries` at all (by design — "generating
    a run and marking paid are admin-only," 0023's own comment), so the
    write happens via the service-role client from inside
    `app/api/coach/payroll/route.ts` and the payroll page's server
    component — both already resolve the requesting coach's own id
    server-side first, so this can't be used to write on someone
    else's behalf.
  - **Dashboard banner**: [app/(coach)/coach/dashboard/page.tsx](<app/(coach)/coach/dashboard/page.tsx>)
    queries for any `coach_seen_at is null` rows, aggregates them into
    one total/count/period, and
    [dashboard-client.tsx](<app/(coach)/coach/dashboard/dashboard-client.tsx>)
    shows a "New payroll ready" banner with a "View payroll →" link —
    the first thing on the dashboard a coach would see, not something
    they'd have to know to go look for.
  - **Deep link, not just a plain link**: admin's Finance defaults to
    the *previous* month, but the coach payroll page's own default was
    *current* month — a coach clicking a plain `/coach/payroll` link
    right after a run would land on a view that doesn't even show what
    they were notified about. The banner link carries
    `?start=&end=` for the exact generated period, and
    [payroll/page.tsx](<app/(coach)/coach/payroll/page.tsx>) now reads
    those as its initial range instead of always defaulting to current
    month.
  - **"Seen" = "actually appeared in a response to this coach"**, not a
    dismiss button — whichever `payroll_entries` rows come back from
    either the page's initial load or `/api/coach/payroll`'s own GET
    get marked seen right there, so the banner clears itself the moment
    the coach genuinely looks (via the deep link or by manually
    browsing to the right range), and stays up otherwise.
  - **Real pre-existing gap fixed along the way**: the coach's own
    Finalized-pay-runs table showed a bare date with no explanation of
    what a row was *for* — no student name, no group-lesson topic, and
    (now that manual adjustments exist) no reason text either, so a
    coach would see an unexplained "$40.00 Pending" or "-$15.00 Pending"
    row. Both `app/api/coach/payroll/route.ts` and
    `app/(coach)/coach/payroll/page.tsx` now join the same
    session/group-lesson/reason data admin's own history route already
    has, and [payroll-range-picker.tsx](<app/(coach)/coach/payroll/payroll-range-picker.tsx>)
    renders it as a "Details" column with the same adjustment badge and
    coral-negative-amount treatment as Finance.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested via
  two mocks:
  [admin finance preview](https://claude.ai/code/artifact/914b91be-0183-4057-99ed-043e696cf672)
  (Generate → Confirm now opens a real popup listing Jordan/Sam/Priya's
  entries and totals summing correctly to the grand total, Done closes
  it) and a new
  [coach payroll notification preview](https://claude.ai/code/artifact/2c73e8c0-9409-497b-8d09-52f09e0eaee1)
  (dashboard shows the "New payroll ready" banner; "View payroll →"
  navigates to the Payroll page showing the fixed Details column —
  student name with a referral badge, and an adjustment with its reason
  and coral negative amount; returning to the Dashboard afterward shows
  the banner has cleared, matching the "seen on view" design).

### Kajabi Library Cards + login fallback page — new, same session
You asked how to wire Kajabi "Library Cards" (Coach Access / Student
Access / Admin Access / Admin-Finance Access) to get people into the
right dashboard. Two real platform constraints got confirmed along the
way, not assumed — both change what's actually buildable:
- **Kajabi has no SSO at all** — confirmed directly against Kajabi's own
  help docs ("Kajabi does not currently support single sign-on (SSO)"),
  neither as an identity provider other apps can use, nor for handing
  a session to an external app from inside Kajabi.
- **Kajabi Pages can't carry a per-member value into a link either** —
  this was already confirmed elsewhere in this codebase (only emails
  support Liquid merge, only inside Kajabi's own campaign builder), so
  even a static "Open Portal" button on a Kajabi page can't be
  personalized per viewer.
- Net effect: **manually granting "Admin Access"/"Admin-Finance
  Access"/"Coach Access" to someone in Kajabi (Grant Offer) doesn't
  reach this app at all** — Grant Offer never fires a webhook (already
  documented in `TSS_App_Spec_1.md`, same reason ambassador students are
  provisioned manually today). A blind background poll to auto-discover
  new grants also isn't safely buildable right now — the only confirmed-
  working Kajabi API call is "look up offers held by a *known* email"
  (`getKajabiContactOfferIds`), not "list every member holding offer
  X" — the analogous endpoint this codebase once assumed existed
  (`/v1/subscriptions`) turned out to 404 in real testing, so guessing
  at another unverified one wasn't worth repeating.

**What's actually built, given those two walls:**
- **The real fix turned out to need no Kajabi mechanism at all** — this
  app already keeps people logged in via a normal persistent session
  cookie once they've signed in once ([lib/supabase/server.ts](lib/supabase/server.ts),
  standard `@supabase/ssr`, nothing shortens it). So a Library Card
  pointing straight at e.g. `/student/dashboard` (not a login page)
  works instantly, one click, for anyone whose browser still has a live
  session — which is the common case. No code needed for this part —
  it's just how you set each card's target URL in Kajabi.
- **New self-service fallback** for the one case that genuinely can't
  be skipped — a session that's actually gone (new device, cleared
  cookies, long absence). Rebuilt [app/login/page.tsx](app/login/page.tsx)
  (previously an unstyled dead-end message, now matches the app's real
  dark theme — own [login.module.css](app/login/login.module.css) since
  this page sits outside every route group and had no theme applied at
  all) with a real "enter your email, get a fresh login link" form
  ([request-link-form.tsx](app/login/request-link-form.tsx)).
- New [request-login-link/route.ts](app/api/auth/request-login-link/route.ts) —
  public/unauthenticated by necessity (nobody's logged in yet when they
  need this), checks students → coaches → admin/admin_finance (the last
  one via `listUsers()` + a `profiles.role` check, since admin accounts
  have no business-table email column to query directly — fine at this
  app's staff-account scale). **Always returns the same generic success
  message regardless of match** — same reasoning as any "forgot
  password" flow, so the endpoint can't be used to check which emails
  have an account.
- New `issueAndSendStaffLoginLink()` in
  [lib/auth/magic-link.ts](lib/auth/magic-link.ts) — factors out the
  Supabase-generateLink-plus-email pattern `provision-coach` already had
  inline, so the new route didn't need a third copy of it.
- `npx tsc --noEmit -p .` and `next build` both clean. Click-tested via
  a new mock:
  [login page preview](https://claude.ai/code/artifact/61cbc72f-3a47-4913-be24-a1ec5c5845e1) —
  the `expired_link` error state renders correctly above the form;
  submitting an email shows the generic "check your inbox" success
  state (same wording regardless of what was typed, matching the real
  route's no-enumeration behavior).

**Not yet built — Kajabi-side product/offer setup itself.** No offer
IDs exist yet in code for Coach Access / Admin Access / Admin-Finance
Access (unlike the 4 student tier offers, which are real, confirmed IDs
already in [lib/kajabi/offers.ts](lib/kajabi/offers.ts)) — nothing to
wire up on the code side until/unless a future feature actually needs
to check offer-holding server-side. For now those 3 products only need
to exist in Kajabi for your own bookkeeping of who has access.

**Follow-up: iframe embed instead of a button, so the card opens the
portal *inside* Kajabi.** You didn't want the extra click through a
Kajabi page with a button — confirmed Kajabi's Custom Code block
(available on pages inside a Course/Product, not just standalone
Website pages) accepts a raw `<iframe>`, so the portal can render
directly inside the Kajabi page a Library Card opens. That needed one
real change on this app's side:
- [next.config.mjs](next.config.mjs) — added a `Content-Security-Policy:
  frame-ancestors` header. Nothing was set before, which meant this app
  was accidentally iframe-able by *any* site (no `X-Frame-Options` was
  ever configured) — this makes it a deliberate, narrow allowance
  instead: only this app's own origin and `NEXT_PUBLIC_KAJABI_SITE_URL`
  (the same env var already driving the Courses/Community nav links)
  may frame it. Verified for real — ran `next start` locally and
  confirmed the header actually appears on a response
  (`curl -I` showed `Content-Security-Policy: frame-ancestors 'self'`;
  it'll also include the Kajabi origin once that env var is set in
  production, which it needs to be for this to work — it's currently
  blank in `.env.example`).
- **Domains confirmed same-site**: the portal
  (`portal.tarasimonstudios.com`) and the Kajabi site
  (`app.tarasimonstudios.com`) share the same registrable domain
  (`tarasimonstudios.com`), which is why the session cookie should
  survive being read inside the iframe with Supabase's default
  `SameSite=Lax` — genuinely cross-site embedding would need
  `SameSite=None` (and its own Safari/Chrome tracking-prevention
  headaches), same-site subdomains shouldn't. Flagged as something to
  confirm with a real click-through once live, not just asserted —
  cross-browser cookie-in-iframe behavior is exactly the kind of thing
  this project's own convention says to verify against the real thing,
  not assume.
- **Kajabi-side steps** (nothing left to build in the app for this):
  in each product's Custom Code block, paste an iframe pointing at the
  matching dashboard route — `/student/dashboard`, `/coach/dashboard`,
  `/admin/overview` (same URL for both Admin and Admin-Finance — role
  is decided by their portal account, not the link), sized to fill the
  page (e.g. `width:100%; height:100vh; border:none;`).

**Follow-up: replaced the emailed-link fallback with an email-then-code
flow, same session.** The "open the emailed link in a normal top-level
tab" step above was a real gap for the iframe case specifically — a
clicked link opens a new browser tab, which means finishing login
always breaks out of the Kajabi embed. You asked for a typed code
instead, which fixes exactly that: a code can be typed right back into
the same embedded `/login` page, no tab-switch required.
- New migration
  [0049_login_codes.sql](supabase/migrations/0049_login_codes.sql) — a
  `login_codes` table, deliberately separate from `magic_link_tokens`
  rather than repurposing it: the *original* one-time "welcome" emails
  (sent right after a Kajabi purchase, or when a coach is provisioned)
  still use the existing link-based mechanism unchanged, since those
  are one-shot onboarding emails, not a repeated "let me back in" flow
  — no reason to touch code that already worked. Same deny-all RLS
  posture as `magic_link_tokens`/`kajabi_events` (0002) — service-role
  only, no anon/authenticated policy.
- New [lib/auth/login-code.ts](lib/auth/login-code.ts) — mints a
  6-digit code, stores only its (email-salted) hash, 10-minute TTL
  (short on purpose — a code is meant to be used in the same sitting,
  unlike a link that's designed to sit in an inbox).
- New [lib/auth/resolve-account.ts](lib/auth/resolve-account.ts) —
  factored out the students → coaches → admin/admin_finance lookup
  that used to live inline in the (now-deleted)
  `request-login-link/route.ts`, since both new routes below need it.
- **Two-step API**: new
  [request-login-code/route.ts](app/api/auth/request-login-code/route.ts)
  (step 1 — email in, generic "sent" response out always, same
  no-enumeration posture as before) and
  [verify-login-code/route.ts](app/api/auth/verify-login-code/route.ts)
  (step 2 — checks the code, then generates a Supabase magic link
  server-side and hands its `action_link` back to the client as JSON
  instead of emailing it, since the client already proved who they are
  and just needs somewhere to navigate). Removed the now-unused
  `issueAndSendStaffLoginLink()` helper from
  [lib/auth/magic-link.ts](lib/auth/magic-link.ts) — it only existed
  for the route this replaced.
- [app/login/page.tsx](app/login/page.tsx) and the renamed
  [login-form.tsx](app/login/login-form.tsx) (was
  `request-link-form.tsx`) now walk email → code as two steps in one
  form, with a "That code is wrong or has expired" inline error and a
  "Use a different email" way back to step 1. New copy per your ask —
  "Private Coaching Studio" as the heading, "let's verify it's really
  you" as the subhead. Keeping "it's really you" generic rather than
  "verify that you are a student" was deliberate: this one page serves
  all four account types (`resolve-account.ts`), so it can't commit to
  a role before it knows who's typing — flagging this in case you
  specifically wanted per-role wording, which would need the page to
  learn the role before showing step 2.
- `npx tsc --noEmit -p .` and `next build` both clean; re-verified the
  CSP header from the iframe work above still applies after this
  change (`next start` + `curl -I` again showed the header). Click-
  tested in the refreshed
  [login page preview](https://claude.ai/code/artifact/61cbc72f-3a47-4913-be24-a1ec5c5845e1)
  (now includes a demo "inbox" showing the exact email copy and code):
  wrong code shows the inline error and lets you retry; the real code
  shows a "Verified — redirecting…" success state; "Use a different
  email" returns cleanly to step 1.

**Not yet done on Admin:**
- Clean up dead pre-sidebar header CSS in `admin.module.css` (see above).
- Decide whether the Needs-Attention tag legend needs distinct colors
  again now that Pause/Trial/Credit all collapsed to the same purple.
- Older admin artifact previews (overview/dashboard/payroll) still show
  the old gold accent — stale visually, not re-verified this session.
- The Needs Review page's own generic resolve flow (approve/deny a
  cancel_request item) still just has needs_action/in_progress/resolved
  — "resolved" still defaults to approved there. The new "Mark
  retained" shortcut only lives on the student page's Stop panel; worth
  deciding if Needs Review itself should also expose a retain/deny
  choice rather than only the student-page shortcut.
- Start's weekly-schedule form and the existing Weekly Schedule panel's
  edit form are two separate components hitting the same API (not
  shared state) — duplicates a handful of form fields rather than
  lifting `editing` state between them; low-risk since Start only shows
  when the other panel has nothing to duplicate against (empty state).

## Key architectural decisions worth remembering

- **Shared dark theme tokens** live in `app/theme-tokens.module.css`,
  composed into each route group's own `.module.css`. Admin no longer
  has a local accent override — it uses `--gold` (purple) exactly like
  student/coach, same as every other token.
- **`BookingClient`** (`app/(student)/student/book/booking-client.tsx`) is
  shared between student's own booking flow and both admin booking routes
  (`book-trial`, `students/[id]/book`) — styled once with `var()`-based
  Tailwind classes so it renders correctly under any theme root.
- **Verification pattern**: real login is Kajabi-magic-link only, so every
  feature gets verified via a local interactive HTML/JS mock (same visual
  tokens) served via `python3 -m http.server`, driven with the browser
  tools, then published as a Claude Artifact — never tested against the
  real Supabase project directly.
- **Cancellation self-service**: only `cancel_subscription` requests exist
  (`student_requests` table, migration 0034 — originally also had `pause`,
  removed). Approving one just marks it resolved — this app has no Kajabi
  cancel API to call, so it's still an off-platform action by admin, just
  tracked via a form + queue instead of a phone call.
