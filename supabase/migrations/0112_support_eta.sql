-- Per-chat wait time an admin promises when pinged ("I'll be there in 3
-- min"). Null = not acknowledged yet, so the student sees the studio's
-- default wait (support_settings.expected_wait_minutes) and the admin
-- portal keeps showing the ping.
alter table support_threads
  add column eta_minutes int check (eta_minutes between 1 and 240),
  add column eta_set_at timestamptz;
