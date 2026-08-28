alter table recurring_schedules
  add column cadence text not null default 'weekly'
  check (cadence in ('weekly', 'biweekly'));
