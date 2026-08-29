-- The join-click audit trail (0065) only ever recognized 1:1 sessions
-- — a click on a group-lesson's Join button had nowhere valid to log
-- to (session_id is FK-constrained to `sessions`, and a group lesson's
-- id isn't a sessions.id), so it was silently rejected by
-- /api/student/join-click's ownership check and never appeared in the
-- Activity Log. Admin explicitly wants this covered too, to answer
-- "did the student actually try to join" for group lessons the same
-- way as 1:1s.
--
-- Separate nullable FK rather than loosening session_id's own
-- constraint, to keep referential integrity for both cases — a
-- join_click row now has exactly one of session_id/group_lesson_id
-- set (a login row has neither).
alter table activity_events add column group_lesson_id uuid references group_lessons (id);

alter table activity_events add constraint activity_events_not_both_session_refs
  check (session_id is null or group_lesson_id is null);

create index activity_events_group_lesson_id_idx on activity_events (group_lesson_id);
