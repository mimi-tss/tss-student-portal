-- flagConsecutiveMisses (lib/admin/attention-items.ts) creates a
-- no_show_1/2/3 item every time it's called — by design, since a coach
-- can legitimately re-mark an already-marked session (mark-attendance's
-- own comment: "no 'already marked' restriction server-side", to allow
-- correcting a misclick). But every one of those calls was an unconditional
-- INSERT with no dedup at all, so re-marking (or re-clicking) the SAME
-- session as no-show/late-forfeit repeatedly created a fresh duplicate
-- Needs Review card each time — confirmed live: one real missed lesson
-- (Jazmynn Hernandez) showing 6+ identical "missed their session" cards.
--
-- Fix going forward: no_show_1/2/3 items now carry the triggering
-- session_id (attention_items.session_id already existed, from 0078 —
-- just never populated for this kind), deduped one-per-session via this
-- new partial unique index + upsert RPC, same idiom as
-- recording_missing's own session_id-keyed dedup (0082/0088). Uniqueness
-- is on session_id ALONE, not (session_id, kind) — a re-mark can shift
-- which of the 3 severity kinds applies (the streak count can change
-- between marks), but the studio only ever wants ONE queue item per
-- session regardless of which severity it ended up landing on.
create unique index attention_items_no_show_session_uidx
  on attention_items (session_id)
  where session_id is not null and kind in ('no_show_1', 'no_show_2', 'no_show_3');

create or replace function attention_item_upsert_no_show(
  p_kind text,
  p_student_id uuid,
  p_session_id uuid,
  p_summary text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() and auth.role() <> 'service_role' then
    raise exception 'admin only';
  end if;

  insert into attention_items (kind, student_id, session_id, summary)
  values (p_kind, p_student_id, p_session_id, p_summary)
  on conflict (session_id) where session_id is not null and kind in ('no_show_1', 'no_show_2', 'no_show_3')
  do nothing;
end;
$$;

revoke all on function attention_item_upsert_no_show from public;
grant execute on function attention_item_upsert_no_show to authenticated;
grant execute on function attention_item_upsert_no_show to service_role;

-- One-time cleanup for duplicates the old unconditional-insert code
-- already created: every existing no_show_* row predates this fix, so
-- none of them has session_id set (the column existed but was never
-- populated for this kind) — the new index above can't catch these
-- retroactively. Collapses only EXACT duplicates (same student, same
-- kind, same summary text, still open) down to the oldest row,
-- resolving the rest — safe because the old rows carry no session-level
-- distinction at all (no date in the summary), so two rows this
-- identical were already indistinguishable from each other under the
-- app's own old logic; nothing here touches the real sessions table,
-- only these review-queue nudge cards, and only ever RESOLVES (never
-- deletes), so a wrongly-collapsed one is still visible and reversible
-- from the Resolved tab.
with ranked as (
  select id, row_number() over (
    partition by student_id, kind, summary
    order by created_at asc
  ) as rn
  from attention_items
  where kind in ('no_show_1', 'no_show_2', 'no_show_3')
    and session_id is null
    and status <> 'resolved'
)
update attention_items
set status = 'resolved', resolved_at = now()
where id in (select id from ranked where rn > 1);
