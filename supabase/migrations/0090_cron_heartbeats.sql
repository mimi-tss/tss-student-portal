-- Nothing currently notices if a scheduled cron (scan-recordings, every
-- 2h via .github/workflows/scan-recordings.yml) silently stops running —
-- an auth failure, a Vercel outage, a quota issue, anything that keeps
-- the job from ever reaching its own success path just means Needs
-- Review/Recordings quietly stop refreshing until someone happens to
-- notice by hand. One row per job, updated at the end of a successful
-- run; the next run compares against it before doing anything else and
-- alerts staff if the gap is bigger than the schedule should ever allow.
-- Deny-all RLS, same posture as kajabi_events/magic_link_tokens (0002)
-- — service-role only, nothing else ever needs to touch this table.
create table cron_heartbeats (
  job_name text primary key,
  last_run_at timestamptz not null
);

alter table cron_heartbeats enable row level security;
