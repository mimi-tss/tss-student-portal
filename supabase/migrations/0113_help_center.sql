-- Public help center (/help) built on the same articles Mel answers from
-- (support_kb_articles, 0111). One article, two uses: Mel reads every
-- active article; only ones marked is_public are shown on the website.
-- Bodies are Markdown (steps, bold, links, screenshots).

alter table support_kb_articles
  add column slug text,
  add column summary text,
  add column is_public boolean not null default false,
  add column helpful_yes int not null default 0,
  add column helpful_no int not null default 0;

-- Slugs for the rows that already exist ("How logging in works" ->
-- "how-logging-in-works"), de-duplicated with a suffix if needed.
update support_kb_articles a
set slug = s.slug
from (
  select id,
    base || case when row_number() over (partition by base order by sort_order, id) > 1
                 then '-' || row_number() over (partition by base order by sort_order, id) else '' end as slug
  from (
    select id, sort_order,
      trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')) as base
    from support_kb_articles
  ) t
) s
where a.id = s.id and a.slug is null;

alter table support_kb_articles alter column slug set not null;
create unique index support_kb_articles_slug_idx on support_kb_articles (slug);

-- Screenshots for articles. Public bucket (help pages are public), but
-- only the service role writes to it (admin upload route).
insert into storage.buckets (id, name, public)
values ('help-images', 'help-images', true)
on conflict (id) do nothing;
