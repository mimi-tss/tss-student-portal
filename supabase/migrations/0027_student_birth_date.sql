-- Coach dashboard's "birthdays this week" reminder (TSS_App_Spec_1.md
-- section 8) needs a real date to work off — no birthday field existed
-- anywhere before this. Month/day only matters (year is stored but never
-- shown to a coach — see the birthdays-this-week query, which only
-- compares month/day). Admin-entered; no Kajabi field carries this.
alter table students add column birth_date date;
