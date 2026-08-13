-- Supports Kajabi magic-link auth (lib/auth/magic-link.ts) and webhook
-- idempotency (app/api/webhooks/kajabi/route.ts).

create table magic_link_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id),
  token_hash text not null unique, -- sha256 of the raw token; raw value is never stored
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index magic_link_tokens_student_id_idx on magic_link_tokens (student_id);

-- Raw Kajabi webhook deliveries, keyed by Kajabi's event id, so retried
-- deliveries are detected and skipped rather than double-processed.
create table kajabi_events (
  id uuid primary key default gen_random_uuid(),
  kajabi_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Both tables are only ever touched by server routes using the service-role
-- (admin) client, never directly from the browser — RLS with no policies
-- means "deny all", which is the correct default here.
alter table magic_link_tokens enable row level security;
alter table kajabi_events enable row level security;
