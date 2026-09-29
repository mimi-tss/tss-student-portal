-- Help center article drafts (written from the portal's actual behaviour).
-- Everything lands as a DRAFT (is_public = false): Mel uses the new wording right
-- away; publish each one in /admin/support/kb after checking it (especially the
-- Kajabi menu names and plan details).
-- Seeded articles are only rewritten if their text is still the original seed —
-- anything already edited in the admin is left alone.

update support_kb_articles set title = $t$How to log in to the portal$t$, summary = $s$The portal uses a 6-digit code sent to your email — no password.$s$, body = $md$The portal has **no password**. Each time you log in, we email you a 6-digit code.

## Steps
1. Go to the login page and type the **email you signed up with**.
2. Tap **Next**.
3. Check your email for **"Your Private Coaching Studio verification code"**.
4. Type the 6 digits and tap **Verify**.

## Good to know
- A code works for **10 minutes** and only **once**.
- If you ask for a new code, the older one stops working — always use the newest email.
- You can tap **Resend code** after 60 seconds.
- Lite members don't have portal access — the portal is part of Suite and up. Lite includes the courses and community in Kajabi.$md$, updated_at = now()
  where slug = 'how-logging-in-works' and body = $orig$The portal has no password. Go to the login page, type the email you signed up with, and we email you a 6-digit code. Enter the code within 10 minutes. Each code works once — if it expired or was already used, just request a new one.$orig$;

update support_kb_articles set title = $t$My login code email never arrived$t$, summary = $s$What to check when the 6-digit code doesn't show up.$s$, body = $md$Try these one at a time:

1. **Check spam, junk and promotions**, and search your inbox for **"Tara Simon Studios"** or **"verification code"**.
2. **Wait a minute or two** — emails can be a little slow.
3. **Check the email you typed.** A typo or an old email address is the most common cause. Use the one you signed up with.
4. Tap **Resend code** (available after 60 seconds) and use the **newest** email only.

Still nothing? Ask Mel — if your account needs checking, Mel will pass it to the team.$md$, updated_at = now()
  where slug = 'code-email-never-arrived' and body = $orig$Check spam/promotions and search your inbox for "Tara Simon Studios". Wait a minute or two, then request a new code. Make sure you typed the same email you used when you signed up (typos and old emails are the most common cause). If it still does not arrive, a person on the team can check your account.$orig$;

update support_kb_articles set title = $t$"You don't have permission to enter this studio"$t$, summary = $s$This message means the email you typed isn't on a portal account.$s$, body = $md$This message appears when the email you typed **isn't on a portal account**.

## What to try
1. Check the email for typos.
2. Try any **other email** you might have signed up with (an old address, a parent's email for younger students, a work email).
3. Lite members don't have a portal account — the portal is part of **Suite and up**.

If none of your emails work, ask Mel and the team will check your account.$md$, updated_at = now()
  where slug = 'you-don-t-have-permission-email-not-found' and body = $orig$That message means the email you typed is not on a portal account. Try any other email you might have used to sign up. If none work, a person on the team needs to check your account — escalate.$orig$;

update support_kb_articles set title = $t$I log in but end up back on the login page$t$, summary = $s$Why you might be sent back to login, and how to fix it.$s$, body = $md$## If your plan is Lite
The portal is part of **Suite, Pro and Elite**. Lite includes the courses and community in Kajabi, so the portal will send you back to the login page with a note about your plan.

## If you're on Suite or higher
1. **Close the tab** completely.
2. Open the portal in a **normal browser window** (not private/incognito).
3. Log in again with a **fresh code**.
4. **On iPhone inside the Kajabi app?** Try opening the portal directly in **Safari** instead.

Still happening? Ask Mel and it'll get the team to look.$md$, updated_at = now()
  where slug = 'logged-in-but-sent-back-to-the-login-page' and body = $orig$Lite members do not have portal access — the portal is part of Suite and up; Lite includes the courses and community in Kajabi. If you are on Suite or higher and keep getting bounced: close the tab, open the portal in a normal browser window (not private mode), and log in again. On iPhone inside the Kajabi app, try opening the portal in Safari directly. If it keeps happening, escalate.$orig$;

update support_kb_articles set title = $t$Cancelling or rescheduling a lesson$t$, summary = $s$Cancel in the Scheduler — 24 hours' notice earns a make-up credit.$s$, body = $md$Your regular weekly lessons are set by the studio. To **reschedule**, you cancel the lesson and then book a make-up with the credit you get.

## How to cancel
1. Open **Scheduler** in the top menu.
2. Under **Upcoming sessions this cycle**, find the lesson and tap **Cancel session**.
3. Add a short **reason** (required) and confirm.

The confirm step shows how many credits you have left this month and this year.

## The rules
- **24+ hours' notice** → you get a **make-up credit**, good for **30 days** after the cancelled lesson.
- **Less than 24 hours** → the lesson is forfeited (no credit).
- You can earn up to **1 credit per month** and **6 per year** from cancellations.
- If you cancel a lesson you **booked with a credit** (24+ hours ahead), you get **that same credit back** — it doesn't count toward the limit.
- You can only cancel lessons in your **current paid period**.

After cancelling, tap **Pick a new time now** to book your make-up. See [Booking a make-up lesson](/help/a/booking-a-make-up-lesson).$md$, updated_at = now()
  where slug = 'cancelling-or-rescheduling-a-lesson' and body = $orig$Your regular weekly lessons are set by the studio. To reschedule, cancel the lesson and then book a make-up with the credit you get. Cancel at least 24 hours before the lesson to earn a make-up credit. Less than 24 hours notice = no credit. Credits expire 30 days after they are created. You can earn up to 1 cancellation credit per month and 6 per year. You can only cancel lessons in your current paid billing period.$orig$;

update support_kb_articles set title = $t$Booking a make-up lesson$t$, summary = $s$Use a make-up credit to book a time with your coach in the Scheduler.$s$, body = $md$Make-up lessons are booked with a **credit** (from a cancellation with 24h+ notice, a studio holiday, or an add-on you bought).

## Steps
1. Open **Scheduler** in the top menu.
2. You'll see which credit will be used — the one that **expires soonest** is used first.
3. Pick a **highlighted date** on the calendar (highlighted = your coach has openings).
4. Tap **Book** next to the time you want.
5. You'll see **"Booked using a session credit."**

## Good to know
- Times are shown in your timezone — change it with the **Timezone** menu on the Scheduler.
- You must book **before your credit expires**. If you pick a date after it expires, you'll be asked to choose an earlier date.
- 60-minute credits show 60-minute times.
- No credits? Your weekly lessons are already scheduled for you — contact the studio to change that time, or to buy an extra lesson.$md$, updated_at = now()
  where slug = 'booking-a-make-up-lesson' and body = $orig$Open Scheduler in the portal, tick the credit you want to use, and pick an open time with your coach. Booking always uses a credit. If the lesson you book with a credit is cancelled again with 24+ hours notice, the same credit comes back.$orig$;

update support_kb_articles set title = $t$Studio holidays$t$, summary = $s$What happens when a holiday lands on your lesson.$s$, body = $md$The studio is **closed on studio holidays** — nothing can be booked those days.

## If a holiday lands on your weekly lesson
- If your month has a **5th week**, your lesson is **moved to the 5th week** automatically.
- If that isn't possible, you get a **make-up credit** instead. Holiday credits **don't expire** and don't count toward your cancellation limit.
- Holiday credits are usually added about **2 weeks before** the holiday.

Use the credit in the **Scheduler** — see [Booking a make-up lesson](/help/a/booking-a-make-up-lesson).$md$, updated_at = now()
  where slug = 'studio-holidays' and body = $orig$The studio is closed on studio holidays and nothing can be booked those days. If a holiday lands on your regular lesson, it is made up — on the 5th week of the month if there is one, otherwise you get a credit.$orig$;

update support_kb_articles set title = $t$Notification settings$t$, summary = $s$Turn email, text and in-app notifications on or off.$s$, body = $md$## Where to find them
1. Click your **initials** (top right of the portal).
2. Choose **Account**.
3. Scroll to **Notifications**.

## What you can change
- **Weekly digest** (email) — a Monday email with your week ahead: upcoming lessons, group sessions, credits and studio news.
- **Alerts** — by **Email**, **Text** and **In-app**: lesson reminders, messages from your coach, recordings, class changes and lesson credits.

Emails about **purchases and your membership** (receipts, credits added, plan changes) are always sent.

**Tip:** Mel can change these for you — just ask, e.g. *"turn off text alerts"*.

Notifications for **Kajabi courses and the community** are set in Kajabi — see [Community and course notifications](/help/a/community-course-notifications).$md$, updated_at = now()
  where slug = 'notification-settings' and body = $orig$In the portal click your initials (top right) > Account (or go to /billing/account). Under notifications you can turn the Weekly digest and Alerts on or off separately for Email, Text and In-app.$orig$;

update support_kb_articles set title = $t$Chatting with your coach$t$, summary = $s$Message your coach from the portal, with photos or files.$s$, body = $md$## Where
- On your **dashboard**, scroll to **Chat with Coach [name]**, or tap **Open full chat →**.

## How
- Type your message and press **Enter** to send (**Shift + Enter** for a new line).
- Tap **Attach** to add a photo or file. In a brand-new chat, send a text message first — then attachments work.

You'll be able to chat once a coach is assigned to you. For studio questions (login, billing, scheduling), ask **Mel** instead.$md$, updated_at = now()
  where slug = 'chatting-with-your-coach' and body = $orig$Use Chat in the portal to message your coach. This help chat is for studio support questions.$orig$;

update support_kb_articles set title = $t$Finding your courses$t$, summary = $s$Your courses live in Kajabi — here's how to get there.$s$, body = $md$Your courses live in **Kajabi**.

- **In the portal:** click **My Library** in the top menu.
- **In the Kajabi app:** open the **Library** tab.

## A course is missing?
Your plan decides which courses you get — see [What each plan includes](/help/a/what-each-plan-includes). If you think you should have it, ask Mel and the team will check your access.$md$, updated_at = now()
  where slug = 'finding-your-courses' and body = $orig$Courses live in Kajabi. In the portal click My Library, or in the Kajabi app open the Library tab. If a course is missing, your plan may not include it — escalate so the team can check your access.$orig$;

update support_kb_articles set title = $t$Finding the Backstage community$t$, summary = $s$Backstage is the studio's community in Kajabi.$s$, body = $md$**Backstage** is the studio's community, and it lives in **Kajabi**.

- **In the portal:** click **Backstage** in the top menu.
- **In the Kajabi app:** open the **Community** tab.

Lite members get the community too.$md$, updated_at = now()
  where slug = 'finding-the-community-backstage' and body = $orig$The community is called Backstage and lives in Kajabi. In the portal click Backstage, or open the Community tab in the Kajabi app. Lite members get the community too.$orig$;

update support_kb_articles set title = $t$Community and course notifications$t$, summary = $s$Kajabi notifications are set in Kajabi, not the portal.$s$, body = $md$Notifications for **Kajabi courses and the Backstage community** are controlled **in Kajabi**, not the portal.

- In the **Kajabi app**, open your **profile → Settings / Notifications**.

The portal's own notification settings only cover lessons, the weekly digest and alerts — see [Notification settings](/help/a/notification-settings).$md$, updated_at = now()
  where slug = 'community-course-notifications' and body = $orig$Kajabi community and course notifications are controlled in Kajabi, not the portal: in the Kajabi app open your profile > Settings/Notifications. The portal notification settings only cover lessons, digest and alerts.$orig$;

update support_kb_articles set title = $t$Changing, pausing or cancelling your plan$t$, summary = $s$Switch plans yourself; pausing and cancelling are requests the team reviews.$s$, body = $md$## Where
1. Click your **initials** (top right of the portal).
2. Choose **Billing**. You'll see your plan, next charge and payment method.

## Change plan
Tap **Change plan**, pick a plan (and billing period, if offered) and confirm. The switch **takes effect right away**. If you're moving to a smaller plan, you'll see what you'd lose first. **Elite** is by application — tap **Contact us**.

## Pause
Tap **Request to pause**, choose the date billing should **resume**, and add a reason. The team follows up before anything changes.

## Cancel
Tap **Cancel** and add a reason. The team will reach out before it's final.

Questions about a charge or a refund? Ask Mel and it'll pass it to the team.$md$, updated_at = now()
  where slug = 'plan-changes-pausing-or-cancelling' and body = $orig$Plan changes, pauses and cancellations are requested in the portal: click your initials (top right) > Billing. The team reviews each request. For billing disputes, refunds or charges you do not recognise, escalate to a person.$orig$;

update support_kb_articles set summary = 'Profile pictures can''t be changed at this time.' where slug = 'profile-picture' and summary is null;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('make-up-credits-explained', 'scheduling', $t$Make-up credits explained$t$, $s$Where credits come from, how long they last, and where to see them.$s$, $md$A **make-up credit** lets you book an extra lesson with your coach.

## Where credits come from
- **Cancelling with 24+ hours' notice** — good for **30 days** after the cancelled lesson. Limit: 1 per month, 6 per year.
- **Studio holidays** — **no expiry**.
- **Lesson add-ons** you buy — usually good for **365 days**.

## Where to see yours
On your **dashboard**, under **Your plan → Makeup credits**, with each credit's expiry date. If one expires within **14 days**, you'll see a reminder banner at the top.

## Using a credit
Book it in the **Scheduler** — see [Booking a make-up lesson](/help/a/booking-a-make-up-lesson). The credit that expires soonest is used first.$md$, 40, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('joining-your-lesson', 'scheduling', $t$Joining your lesson$t$, $s$The Join Session button opens your coach's video link 10 minutes before.$s$, $md$1. Open your **dashboard**.
2. Your **Next session** card shows the time, your coach and the length.
3. The **Join session** button turns on **10 minutes before** your lesson — tap it to open your coach's video call.

The button stays available until the lesson ends. If you don't see a Join button at all, your coach's video link may not be set up yet — ask Mel to let the team know.$md$, 50, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('group-classes', 'scheduling', $t$Group classes$t$, $s$Cancelling a group class and using group class credits.$s$, $md$Your upcoming group classes show on your **dashboard** and in the **Scheduler** under **Upcoming group classes**.

## Cancelling a group class
- **24+ hours' notice** → you get a **group class credit** with **no expiry**, for a future class on the same topic. It doesn't count toward your lesson cancellation limit.
- **Less than 24 hours** → the class is forfeited.

## Using a group class credit
On your dashboard, the **Group class credits** panel lists upcoming classes on the same topic — register straight into one with your credit.$md$, 60, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('your-dashboard', 'portal', $t$Your dashboard, explained$t$, $s$A quick tour of everything on your portal home page.$s$, $md$Your dashboard (**Coaching Studio** in the top menu) shows:

- **Next session** — time, coach and the **Join session** button (turns on 10 minutes before).
- **Homework notes** — the latest notes from your coach.
- **Practice streak** — grows each day you visit and tap something on your dashboard.
- **Chat with your coach** — message them right from the page.
- **Your exercises** — audio exercises your coach assigned you.
- **Shared folder** — files shared between you, your coach and the studio, including your **lesson recordings**.
- **Your plan** — your membership, coach, lessons used this cycle, make-up credits and renewal date.
- **Upcoming lessons this cycle** — everything you have booked in your current paid period.$md$, 5, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('finding-your-lesson-recordings', 'portal', $t$Finding your lesson recordings$t$, $s$Recordings are added to your Shared folder on the dashboard.$s$, $md$When your lesson recording is ready, we'll let you know by **email** and in the portal's **notification bell**.

## Where to find it
1. Open your **dashboard**.
2. Scroll to **Shared folder**.
3. Your recordings are in that folder.

Your shared folder appears once your coach records your first session.$md$, 15, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('changing-your-timezone', 'portal', $t$Changing your timezone$t$, $s$Show lesson times in your own timezone.$s$, $md$Lesson times are shown in **one timezone setting** across the whole portal. It usually picks up your timezone automatically.

## To change it
- Click your **initials** (top right) and choose your timezone, **or**
- Use the **Timezone** menu at the top of the **Scheduler**.$md$, 25, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('updating-your-payment-method', 'billing', $t$Updating your payment method$t$, $s$Change the card used for your membership.$s$, $md$1. Click your **initials** (top right of the portal).
2. Choose **Billing**.
3. Under **Your plan**, tap **Update payment method**.
4. Enter your new card and save — it becomes your default for future charges.

If there's a **payment issue** on your account, booking is paused until your card is updated.$md$, 20, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('buying-add-ons', 'billing', $t$Buying add-ons$t$, $s$Extra lessons, 4-packs, group class packs and more.$s$, $md$1. Click your **initials** (top right of the portal).
2. Choose **Add Ons**.
3. Tap **Add** (for ongoing add-ons) or **Buy** (for one-time purchases) and confirm. One-time add-ons are charged to your card on file right away.

## What's available
Depends on your plan — for example:
- **Suite:** 30-min or 60-min **biweekly lessons**.
- **Pro:** **upgrade to 60-min lessons**, **single lesson add-ons** (30 or 60 min), a **30-min lesson with Tara Simon**.
- **Suite, Pro and Elite:** **4-pack of 30-min lessons**, **4-pack of group classes**, **Spotlight (recital)**.

Lesson add-ons appear as **make-up credits** you book in the Scheduler (usually good for 365 days).$md$, 30, false)
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public)
  values ('what-each-plan-includes', 'billing', $t$What each plan includes$t$, $s$Lite, Suite, Pro and Elite at a glance.$s$, $md$## Lite (free)
Community access: the community feed and channel, Tara's 7-Day Challenge, Tara's Corner and the Practice Sheet. **No portal access.**

## Suite
Everything in Lite, plus VIP community access, Backstage challenges and events, Tarabytes, 12+ mini courses — and a **bonus first 1:1 session** with a TSS Master Coach. Includes the **portal**.

## Pro
Everything in Suite, plus **4 private 30-min coaching sessions a month** with a TSS Master Coach, the Sing Like a Superstar and Riffs & Runs mastercourses, the Vocal Exercises Library and first access to new content — plus yearly bonuses.

## Elite (by application)
Everything in Pro, plus Tara's monthly masterclass, collaboration and promotion, marketing and branding sessions, vocal artistry sessions and recording opportunities.

To switch plans, see [Changing, pausing or cancelling your plan](/help/a/plan-changes-pausing-or-cancelling).$md$, 5, false)
  on conflict (slug) do nothing;
