-- Migrating students in from the old system (Opus1/Kajabi export)
-- surfaced real data this app never captured: phone, gender, address.
-- All nullable, no defaults — same optional-field convention as
-- birth_date (0027).
--
-- Visibility split (enforced the same way email/phone already are —
-- students RLS is row-level only, so this is purely which columns
-- each query selects, not a DB-level restriction; see
-- lib/coach/dashboard-data.ts):
--   - Coach-visible: address_city, address_state, address_country,
--     gender, birth_date (already existed, now also surfaced to coach).
--   - Admin-only, never in a coach-facing select: phone,
--     address_street, address_zip, and all guardian_* columns.
--
-- gender is free text, not an enum — the source data is wildly
-- inconsistent ("Female", "Girl", "F", "she/her", "Male/HeHim",
-- "rather not say"...) and a fixed set would be lossy.
--
-- One guardian per student (name/relationship/phone/email), not a
-- separate accounts-and-dependents system like Opus1 had — admin
-- explicitly doesn't want that rebuilt. A minor's own students.email
-- is typically the parent's real email already (that's how login
-- works today); these columns are just for admin reference/contact,
-- never a second login.
alter table students
  add column phone text,
  add column gender text,
  add column address_street text,
  add column address_city text,
  add column address_state text,
  add column address_zip text,
  add column address_country text,
  add column guardian_name text,
  add column guardian_relationship text,
  add column guardian_phone text,
  add column guardian_email text;
