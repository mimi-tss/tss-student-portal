-- Tracks Meet recordings auto-saved to the admin's Drive (see
-- TSS_App_Spec_1.md section 7) and reconciles each one to the right
-- student's own Drive folder. Meet has no concept of "student" and
-- can't sort recordings itself — this table plus the app-side matching
-- logic (lib/admin/recording-matching.ts) is the only place that
-- happens.
--
-- recorded_date is the recording's own Drive createdTime converted to
-- the coach's timezone (not UTC, not "whenever someone happens to look
-- at the queue") — matching is scoped to same calendar day rather than
-- "newest recording right now" specifically because a coach can mark
-- attendance anywhere from immediately to a week late (confirmed with
-- the studio directly): "newest" would grab a totally unrelated later
-- session's recording once time has passed. Same-day scoping gives the
-- same correct answer regardless of when attendance gets marked.
create table meet_recordings (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches (id), -- null if the filename didn't resolve to a known coach; still queued for manual triage
  drive_file_id text not null unique,
  file_name text not null,
  recorded_date date not null,
  drive_created_at timestamptz not null,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'dismissed')),
  matched_session_id uuid references sessions (id),
  matched_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

-- The queue view's main query: unresolved items for a coach+day.
create index meet_recordings_unmatched_idx on meet_recordings (coach_id, recorded_date) where status = 'unmatched';

alter table meet_recordings enable row level security;

-- Same posture as every other admin-only operational table (e.g.
-- staff_notes, attention_items) — is_admin() covers both admin and
-- admin_finance equally since this isn't a money field.
create policy "admins can do everything with meet recordings"
  on meet_recordings for all
  using (is_admin())
  with check (is_admin());

-- Coaches can see their own queue (read-only) — the confirm/dismiss
-- actions themselves stay admin-only for now, per the studio's own
-- "admin-facing unmatched recordings view" framing (spec section 7);
-- a coach-side action path can be added later if wanted without a
-- schema change.
create policy "coaches can view their own recordings"
  on meet_recordings for select
  using (coach_id = auth_coach_id());
