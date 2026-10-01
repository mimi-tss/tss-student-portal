-- The reason a cancelled session was cancelled was only ever captured on
-- the makeup_credits row that cancellation generated (source_session_id)
-- — and only when a credit was actually granted. A late cancel with no
-- credit, or an admin "staff cancel — no credit", had nowhere to store a
-- reason at all, even when the student or admin typed one in. Storing it
-- directly on the session itself covers every cancellation path
-- uniformly, regardless of whether a credit came out of it.
alter table sessions add column cancel_reason text;
