-- Reverts 0050: meeting link and classroom link turned out to be the
-- same thing for this studio (one link per coach, not two), so the
-- two-column model was wrong. coaches.meet_link (0001) already covers
-- it — dropping the short-lived, never-actually-used classroom_link
-- column rather than leaving dead schema around.
alter table coaches drop column if exists classroom_link;
