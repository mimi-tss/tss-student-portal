-- Duration is now a property of the credit itself, not borrowed from
-- whatever the student's session_duration_minutes happens to be at
-- redemption time — needed so a purchased 60-min add-on credit actually
-- books a 60-min session even for a student whose regular plan is
-- 30-min, and vice versa. Nullable for backward compatibility with rows
-- that predate this column; every new insert sets it explicitly.
alter table makeup_credits add column duration_minutes integer;
