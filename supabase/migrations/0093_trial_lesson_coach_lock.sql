-- Some students pay extra specifically for a trial lesson with a named
-- coach (e.g. Tara herself) rather than "any coach" — the trial-booking
-- flow (both student self-service and admin's book-on-behalf-of) has
-- always been any-coach-picker-first, with no way to lock a granted
-- trial to the one coach it was actually sold for. Nullable: null keeps
-- today's exact behavior (student/admin picks any coach first), a real
-- coach id locks it — the booking flow then skips straight to date/time
-- for that coach, and app/api/booking/book/route.ts rejects a mismatched
-- coachId rather than trusting the client.
alter table entitlements add column coach_id uuid references coaches (id);
