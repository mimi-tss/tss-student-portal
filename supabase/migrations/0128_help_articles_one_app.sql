-- Students should only ever see ONE app: the Sing Smarter App (app.tarasimonstudios.com).
-- Help articles mentioned "Kajabi" / "the Kajabi app", and students started
-- downloading Kajabi's own app from the App Store, which can't open the
-- portal. This swaps those sentences for Sing Smarter App wording. Targeted
-- replace()s, so anything else edited in these articles is kept; a
-- sentence that was already reworded is simply left alone.

-- How to log in (public)
update support_kb_articles set body = replace(body,
  'Lite members don''t have portal access — the portal is part of Suite and up. Lite includes the courses and community in Kajabi.',
  'Lite members don''t have Coaching Studio — it''s part of Suite and up. Lite includes My Library and Backstage in the Sing Smarter App.'),
  updated_at = now()
where slug = 'how-logging-in-works';

-- Sent back to the login page (public)
update support_kb_articles set body = replace(replace(body,
  'The portal is part of **Suite, Pro and Elite**. Lite includes the courses and community in Kajabi, so the portal will send you back to the login page with a note about your plan.',
  'Coaching Studio is part of **Suite, Pro and Elite**. Lite includes **My Library** and **Backstage** in the Sing Smarter App, so Coaching Studio will send you back to the login page with a note about your plan.'),
  '4. **On iPhone inside the Kajabi app?** Try opening the portal directly in **Safari** instead.',
  '4. **On iPhone?** Open **app.tarasimonstudios.com** in **Safari** and log in there.'),
  updated_at = now()
where slug = 'logged-in-but-sent-back-to-the-login-page';

-- Notification settings (public)
update support_kb_articles set body = replace(body,
  'Notifications for **Kajabi courses and the community** are set in Kajabi — see [Community and course notifications](/help/a/community-course-notifications).',
  'Notifications for **My Library** and **Backstage** are set separately — see [Community and course notifications](/help/a/community-course-notifications).'),
  updated_at = now()
where slug = 'notification-settings';

-- Drafts (Mel uses these) — rewritten whole, but only if still the
-- original wording.
update support_kb_articles set
  title = 'Finding your courses',
  summary = 'Your courses are in My Library in the Sing Smarter App.',
  body = $md$Your courses are in **My Library**, inside the **Sing Smarter App**.

1. Open **app.tarasimonstudios.com** in your browser (Safari, Chrome…) and log in.
2. Tap **My Library**. In Coaching Studio, it's in the top menu too.

You don't need to download anything — the Sing Smarter App works right in your browser. Tip: add it to your home screen for one-tap access.

## A course is missing?
Your plan decides which courses you get — see [What each plan includes](/help/a/what-each-plan-includes). If you think you should have it, ask Mel and the team will check your access.$md$,
  updated_at = now()
where slug = 'finding-your-courses' and body like '%Kajabi%';

update support_kb_articles set
  title = 'Finding the Backstage community',
  summary = 'Backstage is the studio community, in the Sing Smarter App.',
  body = $md$**Backstage** is the studio's community, inside the **Sing Smarter App**.

1. Open **app.tarasimonstudios.com** in your browser and log in.
2. Tap **Backstage**. In Coaching Studio, it's in the top menu too.

You don't need to download anything — the Sing Smarter App works right in your browser. Lite members get Backstage too.$md$,
  updated_at = now()
where slug = 'finding-the-community-backstage' and body like '%Kajabi%';

update support_kb_articles set
  title = 'Community and course notifications',
  summary = 'Backstage and My Library notifications are set in your Sing Smarter App profile.',
  body = $md$Notifications for **Backstage** and **My Library** are set in your **Sing Smarter App profile** (open app.tarasimonstudios.com, then your profile and its notification settings).

The Coaching Studio notification settings only cover lessons, the weekly digest and alerts — see [Notification settings](/help/a/notification-settings).$md$,
  updated_at = now()
where slug = 'community-course-notifications' and body like '%Kajabi%';
