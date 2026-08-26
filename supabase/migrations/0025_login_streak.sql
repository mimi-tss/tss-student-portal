-- Login streak (mockup copy: "You're on a 6-day streak, just for showing
-- up — log in tomorrow to keep it going.") — decided: counts the first
-- real interaction (a button click) on the dashboard per calendar day,
-- not a bare page load. See app/api/student/streak/ping/route.ts.
alter table students add column streak_count int not null default 0;
alter table students add column streak_last_active_date date;

-- Students already have update access to their own row scoped elsewhere?
-- No — students have no general UPDATE policy on their own row (admin-
-- only per 0007). The streak ping route uses the service-role admin
-- client to bump these two columns after verifying the caller's own
-- session server-side, rather than opening a broad self-service UPDATE
-- policy on the whole students table.
