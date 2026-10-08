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

-- The #1 access problem: students using an app downloaded from the App
-- Store / Google Play, which can't open Coaching Studio. Pinned first in
-- "Getting in" and published.
insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
values (
  'use-your-web-browser',
  'login',
  'Use your web browser to open Coaching Studio',
  'Coaching Studio only works in Safari, Chrome or another web browser — not in a downloaded app.',
  $md$**Coaching Studio only works in your web browser** — Safari, Chrome, Edge or Firefox.

If you downloaded an app from the **App Store** or **Google Play** to get here, that app **can't open Coaching Studio** — you'll see a blank screen or keep landing back on the login page.

## How to get in
1. Open **Safari** (iPhone/iPad) or **Chrome** (Android or computer).
2. Go to **app.tarasimonstudios.com**.
3. Log in with your email and the 6-digit code we send you.

## Tip: one-tap access
- **iPhone/iPad (Safari):** tap the **Share** button, then **Add to Home Screen**.
- **Android (Chrome):** tap the **⋮** menu, then **Add to Home screen**.

You'll get an icon on your phone that opens the Sing Smarter App straight in your browser — everything in one place: **My Library**, **Backstage** and **Coaching Studio**.$md$,
  1,
  true,
  'students'
)
on conflict (slug) do nothing;

-- "Sent back to the login page": make the browser check step 1.
update support_kb_articles set body = replace(body,
  '1. **Close the tab** completely.',
  '1. **Make sure you''re in your web browser** (Safari or Chrome) at **app.tarasimonstudios.com** — not an app downloaded from the App Store or Google Play. See [Use your web browser](/help/a/use-your-web-browser).
2. **Close the tab** completely.'),
  updated_at = now()
where slug = 'logged-in-but-sent-back-to-the-login-page' and body not like '%use-your-web-browser%';
