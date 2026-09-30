-- The coach portal links to My Library and Backstage too, so Mel's coach
-- chats should know where they are. (Applied to production directly on
-- 2026-09-30; kept here for fresh databases.)
update support_kb_articles set audience = 'both'
where slug in ('finding-your-courses', 'finding-the-community-backstage');
