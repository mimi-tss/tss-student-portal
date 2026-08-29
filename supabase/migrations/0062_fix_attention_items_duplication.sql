-- 0035's own header comment states the intent: "resolving it sticks,
-- even though the underlying condition may still be true — it never
-- re-creates a duplicate for the same still-open condition." The
-- implementation (createIfNew in lib/admin/attention-items.ts) broke
-- that promise: its dedup check only excluded 'needs_action'/
-- 'in_progress' rows, not 'resolved' ones, so resolving (or moving to
-- in_progress) a condition-driven item whose underlying condition is
-- still true (e.g. a permanently-inactive test account) let the very
-- next sync recreate it — confirmed live: 2 permanently-inactive test
-- students ballooned into 42 "Needs Action" rows. The check-then-insert
-- pattern was also non-atomic, so the up-to-4 concurrent reads this
-- page fires per interaction could each independently pass the "not
-- exists" check before any insert committed, compounding it further.
--
-- Fix: collapse existing duplicates (keep the most advanced-status row
-- per student+kind — don't discard an admin's prior resolved/in-progress
-- triage in favor of a freshly-recreated needs_action dupe), then add a
-- partial unique index over just the 6 condition-driven kinds (event-
-- driven kinds like no_show_1/2/3 legitimately recur — each missed-
-- lesson episode is its own row by design, see createAttentionItem's
-- own comment). The app-side fix switches createIfNew to an upsert with
-- onConflict + ignoreDuplicates against this index, which is what
-- actually closes the race — the constraint enforces it atomically
-- regardless of how many concurrent reads hit it.

with ranked as (
  select id,
    row_number() over (
      partition by student_id, kind
      order by
        case status when 'resolved' then 0 when 'in_progress' then 1 else 2 end,
        created_at desc
    ) as rn
  from attention_items
  where student_id is not null
    and kind in (
      'dnc', 'credit_expiring', 'trial_unbooked',
      'no_recurring_schedule', 'hold_ending_soon', 'inactive_10_days'
    )
)
delete from attention_items
where id in (select id from ranked where rn > 1);

create unique index attention_items_condition_kind_student_uidx
  on attention_items (student_id, kind)
  where student_id is not null
    and kind in (
      'dnc', 'credit_expiring', 'trial_unbooked',
      'no_recurring_schedule', 'hold_ending_soon', 'inactive_10_days'
    );
