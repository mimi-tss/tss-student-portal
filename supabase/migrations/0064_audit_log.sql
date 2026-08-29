-- Generic field-level audit trail for "what changed and when" disputes
-- (e.g. a student's tier or email silently changing, a session getting
-- deleted). One row per INSERT/UPDATE/DELETE on a curated list of
-- disputable tables, capturing old/new row state as jsonb and the
-- acting user via auth.uid() — same security definer + auth.uid()
-- pattern already used by auth_student_id()/is_admin() (0007), which is
-- direct proof this resolves correctly inside a function invoked
-- during a normal supabase-js .update()/.insert()/.delete() call:
-- auth.uid() reads the request.jwt.claims GUC set once per PostgREST
-- request, which stays set for the whole transaction (including any
-- trigger that fires within it) regardless of security definer's role
-- switch, which only affects permission checks, not GUC-scoped session
-- state.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid references profiles (id), -- null = system (service-role write: webhook/cron)
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index audit_log_table_name_idx on audit_log (table_name);
create index audit_log_row_id_idx on audit_log (row_id);
create index audit_log_actor_id_idx on audit_log (actor_id);
create index audit_log_changed_at_idx on audit_log (changed_at desc);

alter table audit_log enable row level security;

-- Admin-only read. Deliberately NO insert/update/delete policy for
-- either authenticated or anon — the app is never meant to write here
-- directly, only the trigger function below (which runs as the table
-- owner via security definer and so bypasses RLS entirely) does.
create policy "admins can view audit log"
  on audit_log for select
  using (is_admin());

create or replace function audit_log_row_change() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- Skip no-op UPDATEs (a save that re-writes identical values, or one
  -- that only bumps updated_at) so the log stays signal, not noise.
  -- Strip updated_at before comparing since recurring_schedules and
  -- recurring_coach_blocks always touch it on save regardless of
  -- whether anything else changed. The '-' jsonb operator is a no-op
  -- on tables that don't have that column, so this is safe generically.
  if TG_OP = 'UPDATE'
     and (to_jsonb(OLD) - 'updated_at') is not distinct from (to_jsonb(NEW) - 'updated_at') then
    return NEW;
  end if;

  insert into audit_log (table_name, row_id, action, actor_id, old_data, new_data)
  values (
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    TG_OP,
    auth.uid(), -- null for service-role writes (webhook/cron) — expected; UI shows "System"
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- Curated "disputable/sensitive" table list — deliberately excludes
-- noisy/low-stakes tables like chat_messages. Add more later with the
-- same 3-line pattern.
create trigger trg_audit_students
  after insert or update or delete on students
  for each row execute function audit_log_row_change();

create trigger trg_audit_coaches
  after insert or update or delete on coaches
  for each row execute function audit_log_row_change();

create trigger trg_audit_recurring_schedules
  after insert or update or delete on recurring_schedules
  for each row execute function audit_log_row_change();

create trigger trg_audit_coach_blocks
  after insert or update or delete on coach_blocks
  for each row execute function audit_log_row_change();

create trigger trg_audit_recurring_coach_blocks
  after insert or update or delete on recurring_coach_blocks
  for each row execute function audit_log_row_change();

create trigger trg_audit_makeup_credits
  after insert or update or delete on makeup_credits
  for each row execute function audit_log_row_change();

create trigger trg_audit_sessions
  after insert or update or delete on sessions
  for each row execute function audit_log_row_change();

create trigger trg_audit_student_requests
  after insert or update or delete on student_requests
  for each row execute function audit_log_row_change();
