-- "Found a bug? Report" button in the student + coach headers
-- (components/bug-report-button.tsx). Each submission is one row here;
-- screenshots live in the private `bug-reports` storage bucket and are
-- referenced by path, shown to admin via short-lived signed URLs on
-- /admin/bug-reports.
--
-- Inserts only ever happen server-side through the service-role client
-- in app/api/bug-reports/route.ts (after it verifies the caller's own
-- session), so there's no student/coach insert policy — RLS only needs
-- to let admins read and resolve.
create table bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid references profiles (id) on delete set null,
  reporter_role text,
  reporter_name text,
  email text not null,
  message text not null,
  page_url text,
  user_agent text,
  screenshot_paths text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles (id)
);

create index bug_reports_status_idx on bug_reports (status, created_at desc);

alter table bug_reports enable row level security;

create policy "admins can manage bug reports"
  on bug_reports for all
  using (is_admin())
  with check (is_admin());

-- Private bucket — no storage.objects policies at all, so only the
-- service role can read/write; admins see screenshots via signed URLs.
insert into storage.buckets (id, name, public)
values ('bug-reports', 'bug-reports', false)
on conflict (id) do nothing;
