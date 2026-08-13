-- Initial schema for TSS Student Portal.
-- Mirrors TSS_App_Spec_1.md. Run via the Supabase SQL editor or CLI.

-- One row per authenticated user, linking to their role and underlying record.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'coach', 'admin')),
  created_at timestamptz not null default now()
);

create table coaches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id),
  name text not null,
  email text not null unique,
  hourly_rate numeric(10, 2) not null,
  working_hours jsonb not null default '{}', -- e.g. {"mon": [["09:00","17:00"]], ...}
  meet_link text,
  drive_folder_id text,
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id),
  name text not null,
  email text not null unique,
  kajabi_customer_id text unique,
  assigned_coach_id uuid references coaches (id),
  tier text not null check (
    tier in ('lite', 'suite', 'pro', 'elite')
  ),
  subscription_status text not null default 'active' check (
    subscription_status in ('active', 'paused', 'cancelled')
  ),
  payment_status text not null default 'ok' check (payment_status in ('ok', 'dnc')),
  billing_anniversary_date date, -- day of month/cycle student is billed
  paused_start date,
  paused_end date,
  drive_folder_id text,
  created_at timestamptz not null default now()
);

-- Coach working-hours exceptions: vacation/time-off blocks.
create table coach_blocks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  actual_coach_id uuid not null references coaches (id), -- may differ from assigned_coach_id (substitute)
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  status text not null default 'scheduled' check (
    status in (
      'scheduled',
      'attended',
      'no-show',
      'late-forfeit',
      'cancelled-with-notice',
      'cancelled-no-notice'
    )
  ),
  is_makeup boolean not null default false,
  makeup_credit_id uuid, -- set if this session consumed a makeup credit
  created_at timestamptz not null default now()
);

-- Three distinct makeup credit types; see spec section 5.
create table makeup_credits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  type text not null check (
    type in ('student-fault', 'studio-planned', 'studio-emergency')
  ),
  source_session_id uuid references sessions (id), -- session that generated this credit
  used boolean not null default false,
  used_session_id uuid references sessions (id),
  expires_at timestamptz, -- null = no expiry (studio-emergency)
  created_at timestamptz not null default now()
);

alter table sessions
  add constraint sessions_makeup_credit_fk
  foreign key (makeup_credit_id) references makeup_credits (id);

-- One-time / lifetime / recurring-capped perks, separate from base tier.
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  perk_type text not null, -- e.g. 'trial_lesson', 'mastercourse_unlock', 'insta_reaction'
  recurrence text not null default 'one-time' check (
    recurrence in ('one-time', 'lifetime', 'recurring-capped')
  ),
  used boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table admin_overrides (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  admin_profile_id uuid not null references profiles (id),
  override_type text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create table payroll_entries (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id),
  session_id uuid not null references sessions (id),
  amount numeric(10, 2) not null,
  period_start date not null,
  period_end date not null,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) unique,
  coach_id uuid not null references coaches (id),
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads (id),
  sender_profile_id uuid not null references profiles (id),
  body text,
  attachment_url text,
  created_at timestamptz not null default now()
);

create table homework_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  coach_id uuid not null references coaches (id),
  note text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  mp3_url text not null,
  category text,
  created_at timestamptz not null default now()
);

create table exercise_assignments (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises (id),
  student_id uuid not null references students (id),
  assigned_by_coach_id uuid not null references coaches (id),
  assigned_at timestamptz not null default now()
);

create table recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions (id),
  student_id uuid references students (id),
  drive_file_id text not null,
  matched boolean not null default false,
  created_at timestamptz not null default now()
);

-- Row Level Security: enable on all tables; policies to be added once
-- auth roles (student/coach/admin) are wired up in profiles.
alter table students enable row level security;
alter table coaches enable row level security;
alter table sessions enable row level security;
alter table makeup_credits enable row level security;
alter table entitlements enable row level security;
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table homework_notes enable row level security;
alter table exercises enable row level security;
alter table exercise_assignments enable row level security;
alter table recordings enable row level security;
alter table payroll_entries enable row level security;
alter table admin_overrides enable row level security;
alter table coach_blocks enable row level security;
