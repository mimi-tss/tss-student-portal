-- "With you since" on the coach dashboard's student detail panel is
-- normally derived (earliest session between this student and this
-- coach). That's wrong for students being migrated from the old system
-- (Opus1.io) — their real coaching relationship predates any session row
-- in this app. Admin-settable override, preferred over the derived date
-- when set. See lib/coach/dashboard-data.ts's getStudentSnapshot.
alter table students add column coach_start_date_override date;
