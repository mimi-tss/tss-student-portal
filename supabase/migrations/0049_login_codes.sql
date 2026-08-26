-- Backs the new email-then-code login flow (/login page) — a short
-- numeric code typed directly into the page instead of a link clicked
-- from an email client. Separate from magic_link_tokens (which keeps
-- backing the original one-time "welcome" emails sent right after a
-- Kajabi purchase / coach provisioning — those stay link-based,
-- unaffected) since this is a distinct, short-TTL, role-agnostic
-- mechanism keyed by email rather than a student_id FK.
--
-- Same posture as magic_link_tokens/kajabi_events (0002): only ever
-- touched by server routes using the service-role client, so RLS with
-- no policies (deny-all) is correct here too.
create table login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null, -- sha256 of the raw 6-digit code; raw value is never stored
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index login_codes_email_idx on login_codes (email);

alter table login_codes enable row level security;
