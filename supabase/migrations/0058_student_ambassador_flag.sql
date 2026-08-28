-- Ambassador tag: admin-settable flag for students who get a discount or
-- free plan in exchange for promotion/moderation/etc, or simply given by
-- Tara. Purely cosmetic on the student dashboard ("Pro (Ambassador)"
-- instead of the plain tier label) — doesn't affect billing, entitlements,
-- or scheduling. Same posture as coaches.active (0042) and
-- referred_by_coach_id (0045): no new RLS policy needed, "admins can
-- update all students" (0007) already covers every column on this table.
alter table students add column ambassador boolean not null default false;
