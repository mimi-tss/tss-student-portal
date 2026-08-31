-- Two new Needs Review kinds, both forward-looking only (never applied
-- to historical backlog — an already-overwhelming pile of old
-- recordings/sessions with no clean match is expected and not useful to
-- surface here, per direct conversation about this exact page getting
-- flooded):
--   - recording_unmatched: a recording came in but couldn't be
--     confidently mapped to a student (name-in-notes was ambiguous or
--     absent, day+session matching found nothing clean either).
--   - recording_missing: a session has clearly already happened (well
--     past its scheduled end, generous grace period for Meet's own
--     processing delay) and still has no recording matched to it at
--     all.
--
-- Neither fits the existing (student_id, kind) dedup pattern from 0062
-- — recording_unmatched often has no known student at all, and
-- recording_missing needs to recur per session occurrence (a student's
-- weekly slot missing its recording twice in different weeks are two
-- real, separate things to review), not just once ever. New FK columns
-- mirror how request_id already works for cancel_request — a
-- per-occurrence anchor for each kind's own dedup index.
alter table attention_items add column session_id uuid references sessions (id);
alter table attention_items add column recording_id uuid references meet_recordings (id);

alter table attention_items drop constraint attention_items_kind_check;
alter table attention_items add constraint attention_items_kind_check check (kind in (
  'dnc',
  'cancel_request',
  'trial_unbooked',
  'credit_expiring',
  'upgraded_suite',
  'upgraded_pro',
  'upgraded_elite',
  'coach_block_added',
  'no_show_1',
  'no_show_2',
  'no_show_3',
  'no_recurring_schedule',
  'hold_ending_soon',
  'inactive_10_days',
  'recording_unmatched',
  'recording_missing'
));

create unique index attention_items_recording_kind_uidx
  on attention_items (recording_id, kind)
  where recording_id is not null and kind = 'recording_unmatched';

create unique index attention_items_session_kind_uidx
  on attention_items (session_id, kind)
  where session_id is not null and kind = 'recording_missing';
