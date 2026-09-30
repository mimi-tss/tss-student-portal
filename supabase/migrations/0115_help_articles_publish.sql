-- More help-center articles + first publish (applied to production via the API
-- on 2026-09-29; kept here so a fresh database gets the same content).
-- Kajabi-app articles (finding-your-courses, finding-the-community-backstage,
-- community-course-notifications) stay drafts until the Kajabi menu names are confirmed.

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('getting-help-from-mel', 'portal', $t$Getting help from Mel$t$, $s$Mel is the studio's AI assistant — here's what it can do.$s$, $md$**Mel** is the studio's AI assistant. It answers questions any time, day or night.

## Where to find Mel
- **In the portal:** tap the **Mel icon** (the chat bubble next to the bell, top right).
  - On a computer, Mel opens on the right so you can keep using the page.
  - On a phone, Mel opens full screen — tap **—** to shrink it to a bubble in the corner, and tap the bubble to come back.
- **Anywhere else:** go to the [Help center](/help) and tap **Ask Mel**.

## What Mel can do
- Answer questions about logging in, lessons, credits, billing, courses and Backstage.
- When you're logged in: look up **your** lessons, credits and settings.
- **Cancel or book a lesson** and **change your notification settings** — Mel shows a card and only makes the change when you tap **Confirm**.
- Get a **person from the studio team** when something needs a human.

Tip: tap the suggested replies under Mel's message instead of typing.$md$, 1, true)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('booking-your-free-trial-lesson', 'scheduling', $t$Booking your free trial lesson$t$, $s$Suite members get a free first 1:1 session — book it in the Scheduler.$s$, $md$Suite members get a **free first 1:1 session** with a TSS Master Coach.

## How to book it
1. Open **Scheduler** in the top menu.
2. You'll see **Book Your FREE First Vocal Coaching Session**.
3. **Choose a coach** (if a coach was already picked for you, this step is skipped).
4. Pick a **highlighted date**, then tap **Book** next to a time.
5. You'll see **Trial lesson booked!** — tap **Go to dashboard**.

Trial lessons are **30 minutes**. Times are shown in your timezone — change it with the **Timezone** menu on the Scheduler.$md$, 3, true)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('why-cant-i-book-a-lesson', 'scheduling', $t$Why can't I book a lesson?$t$, $s$Common reasons booking is unavailable, and what to do.$s$, $md$## "Your subscription is currently paused" or "has been cancelled"
Booking is turned off while your membership is paused or cancelled. See [Changing, pausing or cancelling your plan](/help/a/plan-changes-pausing-or-cancelling).

## "There's a payment issue on your account"
Update your card and booking turns back on — see [Updating your payment method](/help/a/updating-your-payment-method).

## "The studio is closed that day"
That date is a **studio holiday** — pick another day. See [Studio holidays](/help/a/studio-holidays).

## "No session credits available"
Booking in the Scheduler always uses a **make-up credit**. Your regular weekly lessons are already scheduled for you. To get a credit, cancel a lesson with 24+ hours' notice, or buy one in [Add Ons](/help/a/buying-add-ons).

## "This time is past your session credit's expiry"
Your credit expires before that date — choose an **earlier** date.

## "Your plan doesn't include new bookings"
Your plan doesn't include 1:1 lessons. See [What each plan includes](/help/a/what-each-plan-includes).$md$, 35, true)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('using-your-shared-folder', 'portal', $t$Using your shared folder$t$, $s$Share files with your coach — and find your recordings.$s$, $md$Your **Shared folder** is on your **dashboard**. You, your coach and the studio can all see it.

## What you can do
- **⬆ Upload** — add a file from your device (you'll see the upload progress).
- **🔗 Add shortcut** — paste a **Google Drive link** to share something that's already in Drive.
- **Remove** items you no longer need.

Your **lesson recordings** are added to this folder too.

Your shared folder appears once your coach records your first session.$md$, 16, true)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('your-practice-exercises', 'portal', $t$Your practice exercises$t$, $s$Audio exercises your coach assigns you, right on your dashboard.$s$, $md$Your coach can assign you **practice exercises**.

## Where to find them
1. Open your **dashboard**.
2. Scroll to **Your exercises**.
3. Each exercise has a title, a short description and an **audio player** — press play and practise along.

If you see **"Nothing assigned yet."**, your coach hasn't assigned any exercises yet.$md$, 17, true)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('your-practice-streak', 'portal', $t$Your practice streak$t$, $s$How the streak on your dashboard counts days.$s$, $md$Your **Practice streak** is on your dashboard.

- It grows by one each day you **visit your dashboard and tap something** on it (a button or a link). Just opening the page doesn't count.
- The 7 bulbs show your current week.
- Miss a day and the streak starts again — log in tomorrow to keep it going!$md$, 18, true)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('updating-your-account-details', 'portal', $t$Updating your account details$t$, $s$Change your name, phone, birthday or address.$s$, $md$1. Click your **initials** (top right of the portal).
2. Choose **Account**.
3. Tap **Edit**, update your details and tap **Save**.

## What you can change
- **Name, phone, birthday, gender**
- **Address** (street, city, state, ZIP, country)
- **Parent or guardian** details (for students under 18)

Your **login email** is shown on the same page. To use a different login email, ask Mel and the team will help.$md$, 20, true)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('invoices-and-receipts', 'billing', $t$Invoices and receipts$t$, $s$Where to find your past charges.$s$, $md$1. Click your **initials** (top right of the portal).
2. Choose **Billing**.
3. Scroll to your **invoices** to see past charges.

Emails about **purchases and your membership** (receipts, credits added, plan changes) are always sent to you, whatever your notification settings.

Questions about a charge? Ask Mel and it'll pass it to the team.$md$, 25, true)
  on conflict (slug) do nothing;

update support_kb_articles set is_public = true where slug in ('how-logging-in-works', 'code-email-never-arrived', 'you-don-t-have-permission-email-not-found', 'logged-in-but-sent-back-to-the-login-page', 'cancelling-or-rescheduling-a-lesson', 'booking-a-make-up-lesson', 'make-up-credits-explained', 'joining-your-lesson', 'group-classes', 'studio-holidays', 'your-dashboard', 'finding-your-lesson-recordings', 'changing-your-timezone', 'notification-settings', 'chatting-with-your-coach', 'profile-picture', 'what-each-plan-includes', 'plan-changes-pausing-or-cancelling', 'updating-your-payment-method', 'buying-add-ons', 'getting-help-from-mel', 'booking-your-free-trial-lesson', 'why-cant-i-book-a-lesson', 'using-your-shared-folder', 'your-practice-exercises', 'your-practice-streak', 'updating-your-account-details', 'invoices-and-receipts');
