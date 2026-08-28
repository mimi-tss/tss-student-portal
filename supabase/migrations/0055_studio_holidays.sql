-- Studio-wide closure dates — distinct from coach_blocks (per-coach time
-- off): a holiday closes every coach at once, and any session already
-- sitting on one gets auto-forfeited with no makeup credit, not just
-- blocked from new bookings. Seeded with the studio's 2026 official
-- holidays; Easter and Thanksgiving shift every year, so this is a real
-- admin-managed list (see the new Coaches-tab "Studio holidays" panel),
-- not a hardcoded constant that'd need a code deploy each year.
create table studio_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  label text,
  created_at timestamptz not null default now()
);

alter table studio_holidays enable row level security;

create policy "admins manage studio holidays"
  on studio_holidays for all
  using (is_admin())
  with check (is_admin());

-- Read-only for everyone else — harmless studio-wide info, and lets a
-- future booking UI explain *why* a date is closed rather than just
-- hiding it silently.
create policy "authenticated users can view studio holidays"
  on studio_holidays for select
  using (auth.uid() is not null);

insert into studio_holidays (date, label) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-04-05', 'Easter Sunday'),
  ('2026-07-04', 'Independence Day'),
  ('2026-11-26', 'Thanksgiving Day'),
  ('2026-12-24', 'Christmas Eve'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-31', 'New Year''s Eve');

-- New session status: 'holiday' — a studio-wide closure forfeit. Same
-- "held, grey, no attendance" display treatment as cancelled-no-notice/
-- paused (components/coach-calendar.tsx), but deliberately its own
-- status: unlike cancelled-no-notice it is NOT a paid status (nobody is
-- working that day, so no coach compensation — lib/payroll/calculate.ts's
-- PAID_STATUSES simply omits it), and unlike paused it's a permanent
-- forfeit tied to one fixed calendar date rather than a resumable
-- window. No makeup credit is ever granted or reinstated for it.
alter table sessions drop constraint sessions_status_check;
alter table sessions add constraint sessions_status_check
  check (status in (
    'scheduled',
    'attended',
    'no-show',
    'late-forfeit',
    'cancelled-with-notice',
    'cancelled-no-notice',
    'paused',
    'holiday'
  ));
