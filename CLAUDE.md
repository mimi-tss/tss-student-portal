# TSS Student Portal: notes for Claude

Read this before changing anything. It's for every Claude session on this repo, including team members fixing small issues while Mimi (repo owner, GitHub `mimi-tss`) is away.

## What this is

The portal for Tara Simon Studios, a singing-lesson studio. It lives at https://portal.tarasimonstudios.com.

- **Students** book and manage 1:1 lessons, join group classes, and see recordings, exercises and chat.
- **Coaches** see their schedule, mark attendance and handle payroll.
- **Admins** manage students, billing, needs-review items and reports.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind, Supabase (Postgres + auth), Vercel hosting, and Stripe billing. Kajabi (app.tarasimonstudios.com) is the students' front door and links into the portal.

**Pushing to `main` deploys straight to the live site** (Vercel, about 2 minutes). Real students and coaches see it right away.

## Rules for team members' sessions

If you're working for someone other than Mimi, follow these rules. Mimi decides for herself.

### You can fix and push directly (small fixes)
- Layout and display: warped or overflowing screens, mobile layout, wrapping, colors, spacing
- Wording, labels, typos
- Timezone *display* bugs, where a time shows but in the wrong format or zone
- Scheduling *screen* bugs: calendar display, a filter that's wrong, a button that doesn't respond
- A crash or error on one page, when the fix stays on that page

### Open a pull request instead, and tell the person Mimi must approve it
- Anything touching **billing, Stripe or money**: `app/billing/`, `app/api/billing/`, `app/api/webhooks/`, `lib/stripe/`, `lib/billing/`, payroll
- **Login and permissions**: `app/auth/`, `app/login/`, `lib/auth/`, `lib/supabase/`, `middleware.ts`
- **Database changes**: anything in `supabase/migrations/`. Mimi runs these by hand in Supabase.
- **Scheduled jobs and notifications**: `app/api/cron/`, `.github/workflows/`, `lib/notifications/`, `lib/email/`, `lib/ghl/`
- How recurring lessons are *generated*: `lib/scheduling/recurring.ts`, `materializeRecurringSessions`
- Deleting features, pages or data, or any change touching more than about 5 files

To open one: create a branch, commit, push the branch, and open a pull request with a plain-English description.

### Never
- **Never run scripts or queries against the database.** `.env.local` points at the LIVE database with real students. Fix data through the admin screens, which log who changed what, or ask Mimi.
- **Never create test data under a real person's account** (chats, bookings, notifications). An earlier test showed up as a message "from Tara" and alarmed the team. Use your own login, or ask first.
- Never commit `.env*` files, keys or passwords.
- Never force-push, rewrite history, or delete branches you didn't create.

### Before pushing
1. Run `npx tsc --noEmit`. It must show no errors.
2. For a visual fix, run the app (`npm run dev`) and check the page at desktop and phone width (375px).
3. Write the commit message in plain English: what was wrong, what you changed and why. Mimi gets these by email and reads them to see what changed.
4. Tell the person, in plain words, what you fixed and how to check it. After the deploy finishes, a hard refresh (Cmd+Shift+R) shows the new version.

If a "small fix" turns out to need billing, database or scheduling-logic changes, stop and explain instead of pushing.

## Where things are

| Area | Location |
| --- | --- |
| Admin pages | `app/(admin)/admin/…`; the student detail page is `students/[studentId]/` |
| Coach pages | `app/(coach)/coach/…` |
| Student pages | `app/(student)/student/…`; booking is under `book/` |
| Calendar grid (coach and admin) | `components/coach-calendar.tsx`, `app/(admin)/admin/coaches/all-coaches-day-client.tsx` |
| Timezone display | `components/timezone-context.tsx`, `components/formatted-time.tsx`, `lib/timezone.ts` |
| Scheduling logic | `lib/scheduling/` (recurring lessons, holidays, working hours) |
| Colors and theme | `app/theme-tokens.module.css`; calendar slot colors are `--slot-*` |
| Shared admin styles | `app/(admin)/admin.module.css` |
| Fuller background | `TSS_App_Spec_1.md` (spec), `PROGRESS.md` (long build log; search it, don't read it all) |

Timezones: coach working hours and `recurring_schedules.start_time` are wall-clock times in the **coach's** own zone. Anything shown to a viewer is converted to the viewer's selected zone. A "wrong time" bug is usually one side skipping that conversion.

## Business facts that explain odd-looking data

- **All billing is in Stripe**, on two accounts: the current one ("own") and the legacy "Opus" account. Nobody is billed through Kajabi.
- Students are being moved from Opus to new subscriptions. Because the current month is already paid, a moved student's new subscription is *scheduled* to start at their next billing date. Until then, a student can have a Stripe customer but no subscription. That's expected, not a bug.
- One Stripe customer can pay for two students. Cassi and Michele Garabedian, mother and daughter, share one. Match Stripe events by subscription, not customer.
- Tiers: Lite (no portal access), Suite, Pro, Elite. Pro and Elite students have weekly 1:1 lessons. An admin can put a student on **biweekly** lessons, e.g. 60 minutes every other week, while they stay on Pro.
- Calendar colors: purple = scheduled, yellow = trial, pink = makeup, blue = biweekly student, green = group class, grey = held/blocked.
- "Paid through": monthly students see one billing cycle ahead. 6-month and yearly students (`students.billing_interval`) see their whole prepaid term.
