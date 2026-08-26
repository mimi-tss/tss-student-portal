-- Exercises Library switches from admin-uploaded-to-Supabase-Storage to
-- syncing directly off a shared Google Drive folder the studio already
-- manages by hand (add/remove files there, sync pulls the catalog up to
-- date) — see lib/google/drive.ts's listAudioFilesInFolder /
-- lib/exercises-sync.ts. `mp3_url` now stores a Drive file id instead of
-- a Supabase Storage path; playback proxies through
-- app/api/exercises/[id]/audio rather than a signed Storage URL, so the
-- "no visible download link" posture is unchanged.
--
-- `active` lets a sync mark a since-removed Drive file's row inactive
-- without deleting it outright — exercise_assignments has a not-null FK
-- to exercises, so a hard delete would orphan/break any student it was
-- already assigned to. Inactive exercises drop out of the catalog/assign
-- dropdown but stay visible to whoever already has them assigned.
alter table exercises add column active boolean not null default true;

-- The exercise-audio Supabase Storage bucket created in migration 0024
-- is now unused (superseded by the Drive-backed flow above) — left in
-- place rather than dropped, since removing a storage bucket isn't
-- reversible and it's harmless sitting empty.
