-- Help article for "my video won't upload" (a student on an Android phone
-- over mobile data couldn't send videos). Mel answers from its articles
-- only, and none covered uploads, so it had nothing to troubleshoot with.
-- Written for the student, but phrased so Mel can walk through it one
-- question at a time.
insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('video-wont-upload', 'portal', $t$My video won't upload$t$, $s$Fixes for a video that won't send to your coach from your phone.$s$, $md$If a video won't upload, work through these one at a time.

## First, check
- **App or browser?** If you're in an app, try again in **Chrome** (Android) or **Safari** (iPhone) at portal.tarasimonstudios.com. Uploads work best there.
- **Wi-Fi or mobile data?** Uploads work best on Wi-Fi. If you're on mobile data, turn **Data Saver** off.
- **What happens?** An error message, or does it just sit there? Note the exact words if you see an error.
- **How long is the video?** Long or high-quality videos can be 1–3 GB.

## Fixes
- **Stay on the page and keep your screen on** until it says "✓ Sent". Switching to another app or letting your phone sleep pauses the upload.
- Videos upload in small pieces and **pick up where they left off** if the connection drops, so just tap upload again.
- **Make the video smaller.** Recording at 1080p instead of 4K (in your phone's Camera settings) makes the file much smaller and much faster to send on mobile data.

Still stuck? Tell us which phone you have, whether you used an app or a browser, how long the video is, and the exact error, and the team will take a look.$md$, 17, true)
  on conflict (slug) do nothing;
