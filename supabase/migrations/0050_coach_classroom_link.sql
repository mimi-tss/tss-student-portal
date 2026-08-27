-- coaches.meet_link already existed (0001) but nothing ever let admin
-- edit it after initial provisioning. Adding classroom_link alongside it
-- (Google Classroom, separate from the Google Meet link) so both can be
-- managed from the Coaches tab. No RLS change needed — "admins can
-- update coaches" (0041) is a table-wide policy already widened to admit
-- admin_finance via is_admin() (0046).
alter table coaches add column if not exists classroom_link text;
