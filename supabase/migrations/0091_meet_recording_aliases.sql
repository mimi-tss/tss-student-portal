-- Some students' Meet recordings never show their own name at all — a
-- parent's Google account joins on their behalf every week (confirmed
-- live: Angelica Nesenchuk's coach only ever refers to her, in the
-- Gemini notes doc, as "Natalie Semon" — her mom's account name — and
-- "Angelica" never appears in it anywhere), so no amount of smarter
-- text-matching against the student roster would ever find her. This
-- table remembers that mapping once an admin manually matches a
-- recording, so the next one auto-matches instead of hitting the
-- manual queue again for the same student every single week.
-- Deliberately keyed per-coach, not global — the same first name from a
-- different family shouldn't cross-pollinate another coach's roster.
create table meet_recording_aliases (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id),
  alias_name text not null,
  student_id uuid not null references students (id),
  created_at timestamptz not null default now(),
  unique (coach_id, alias_name)
);

alter table meet_recording_aliases enable row level security;
