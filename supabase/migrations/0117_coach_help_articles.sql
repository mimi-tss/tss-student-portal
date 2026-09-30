-- Coach help-center articles (audience = coaches), written from the coach
-- portal's actual behaviour. Published for coaches straight away — they're
-- only ever shown in the private /coach/help and to Mel in coach chats.

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-your-schedule-and-calendar', 'coach-schedule', $t$Your schedule and calendar$t$, $s$Day, week and month views, and what each colour means.$s$, $md$Open **My Schedule** in the top menu.

## Views
- Switch between **Day**, **Week** (default) and **Month**.
- Use **←**, **Today** and **→** to move around.
- In **Month** view, each day shows how many sessions you have, and **"N needs mark"** if attendance is missing. Click a day to open it.

## What the colours mean
The legend above the calendar shows each one:
- **Available** — open time.
- **Scheduled** — a booked 1:1 lesson.
- **Trial lesson** — a student's free first session (tooltip: *pitch Pro upgrade*).
- **Biweekly student**, **Makeup**, **Group lesson** — as named.
- **Blocked** — your time off, or a studio-wide holiday.
- **Held (no booking)** — a slot kept for a student: a late cancel, a paused student's reserved time, or a studio holiday.

Times show in the timezone at the top of the page — change it with **Viewing in…** in the header.

The calendar is **view-only** except for marking attendance — booking and cancelling lessons are done by the studio admin.$md$, 10, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-adding-time-off', 'coach-schedule', $t$Adding time off$t$, $s$Block out time on your calendar — and what happens to booked lessons.$s$, $md$1. Open **My Schedule**.
2. Scroll to **Add time off** at the bottom.
3. Choose the **Start** and **End** date and time, add a **Reason** (e.g. Event, Meeting, Break) and tap **Add**.

## Good to know
- Time off is **one-off**. For something that repeats every week, ask the admin.
- You can't edit or delete a block yourself — ask the admin (or ask Mel to pass it on).
- **Lessons already booked in that time are not cancelled automatically.** The admin is notified and will sort them out with your students.
- The studio team gets a Slack message whenever you add time off.$md$, 20, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-working-hours', 'coach-schedule', $t$Changing your working hours$t$, $s$Your regular weekly hours are set by the studio admin.$s$, $md$Your regular weekly **working hours** (the times students can book with you) are set by the **studio admin** — there's no setting for them in the coach portal.

To change them, message the admin or ask **Mel** to pass your request on. The admin can also schedule a change to start on a future date.

For a one-off absence, use [Adding time off](/coach/help/a/coach-adding-time-off) instead.$md$, 30, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-meeting-room', 'coach-schedule', $t$Your meeting room link$t$, $s$Open your video room from the dashboard.$s$, $md$On your **Dashboard**, tap **Open my meeting room →** to start your video call.

- Your link includes a coach-only part that students never see.
- Students join from their own portal with the **Join session** button, which turns on 10 minutes before the lesson.
- Your meeting link is set by the **studio admin**. If the button is missing or the link is wrong, ask the admin (or Mel).$md$, 40, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-timezone-and-stuck-screen', 'coach-schedule', $t$Timezone and fixing a stuck screen$t$, $s$Header tools: timezone, refresh and "Fix stuck screen".$s$, $md$## Timezone
Your portal shows times in **your own timezone** (set by the admin). To view another zone, use **Viewing in…** in the header.

## Refresh
Tap **↻ Refresh** to reload the latest data.

## Fix stuck screen
If the portal seems stuck or keeps showing old information, tap **Fix stuck screen** in the header. It signs you out and takes you to the login page — log back in with a new code.$md$, 50, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-marking-attendance', 'coach-lessons', $t$Marking attendance$t$, $s$Mark every lesson — unmarked sessions are not paid.$s$, $md$**Unmarked sessions are not paid**, so mark every lesson after it ends.

## From your Dashboard
- **Today's Schedule:** once a session ends, tap **✓** (attended) or **✕** (no-show).
- **Needs Attendance — Previous Classes:** any past sessions you haven't marked yet, with ✓ / ✕ buttons.

## From your calendar
On **My Schedule**, click a past session and choose **Attended**, **No-show** or **Late-forfeit**.

## No-shows
When you mark a **no-show**, you'll be asked to confirm. The box **"Send the missed-lesson email"** is ticked by default — the email goes out **2 hours later** unless you change the status back. Already heard from the student? Untick it and let the studio know on Slack.

You can change a mark at any time.$md$, 10, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-homework-and-coach-notes', 'coach-lessons', $t$Homework notes vs coach notes$t$, $s$One is for the student, the other is private.$s$, $md$Both are in the student's panel on your **Dashboard** (click a student in Today's Schedule or **My Students**).

## Homework Notes — the student sees these
- Type in **Add a homework note…** and tap **Add note**.
- The student sees your latest note on their dashboard.
- All coaches who've worked with the student share these notes.

## Coach Notes — private
- Visible to **coaches and admin only, never the student** (shown in green).
- Use them for teaching notes, progress, anything internal.

Notes can't be edited or deleted once added — ask the admin if one needs removing.$md$, 20, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-assigning-exercises', 'coach-lessons', $t$Assigning exercises$t$, $s$Give students audio exercises to practise.$s$, $md$1. Open the student's panel on your **Dashboard**.
2. In **Exercises**, start typing in **Type to search exercises…** (use the arrow keys and Enter, or click).
3. Tap **Assign** — you'll see **Assigned.**

The student sees it under **Your exercises** on their dashboard, with an audio player.

To take one away, tap **Unassign** next to it.$md$, 30, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-shared-folder-and-recordings', 'coach-lessons', $t$Shared folders and recordings$t$, $s$Share files with a student; recordings land in the same folder.$s$, $md$Each student has a **Shared Folder** (in their panel on your Dashboard) that you, the student and the admin can all use.

- **⬆ Upload** — add a file.
- **🔗 Add shortcut** — paste a Google Drive link and tap **Add**.
- **✕** — remove an item.

Files can be viewed or removed, but **never downloaded**.

## Recordings
Lesson recordings are matched to sessions by the studio and **added to the student's shared folder** automatically.

When a student uploads a file, you'll get a Slack message on your personal channel (if you have one set up).$md$, 40, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-group-lessons', 'coach-lessons', $t$Group lessons$t$, $s$Taking attendance and messaging the whole class.$s$, $md$Group lessons are created and assigned to you by the admin. They show on your schedule as **Group lesson**.

## Taking attendance
Click the group lesson to see the **Roster**, then mark each student **✓ / ✕** (or **Attended / No-show** on the calendar). **Clear** resets a student to registered.

## Messaging the class
In the group lesson panel, type in **Message the class** and tap **Send to class**. Each student gets it in their **own chat** with you (you'll see *"Sent to X/Y students"*).

Group lessons are paid **once per lesson**, however many students attend.$md$, 50, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-trial-lessons', 'coach-lessons', $t$Trial lessons$t$, $s$Free first sessions — and a chance to invite students to Pro.$s$, $md$Suite members get a **free first 1:1 session**. Trials are booked by the student (or granted by the admin) and show on your schedule as **Trial lesson**, tagged **· Trial**.

Trial lessons are **30 minutes**. They're a great moment to show the student what weekly coaching could do — the calendar tooltip reminds you to **pitch the Pro upgrade**.$md$, 60, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-cancelling-or-moving-a-lesson', 'coach-lessons', $t$Cancelling or moving a student's lesson$t$, $s$Coaches can't cancel or reschedule — here's what to do instead.$s$, $md$Coaches **can't cancel, reschedule or reassign** lessons in the coach portal — these are done by the **studio admin**.

- **A student wants to reschedule?** They cancel in their own **Scheduler** (24+ hours' notice earns a make-up credit) and book a new time with the credit.
- **You can't make a lesson?** Add [time off](/coach/help/a/coach-adding-time-off) and tell the admin — they'll move or cover the lesson.
- **Something else?** Message the admin or ask **Mel** to pass it on.$md$, 70, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-student-details', 'coach-students', $t$Your students and their details$t$, $s$Everything in a student's panel on your dashboard.$s$, $md$## Finding a student
- **My Students** lists your students (search with **Search students…**). Click one to open them on your Dashboard.
- Or click a student in **Today's Schedule**.

## What you'll see
- **Tier**, **sessions this cycle** ("X of Y used"), **make-up credits**, **next session**, **with you since**, **age**, **birthday**, **gender** and **location**.
- Panels: **Homework Notes**, **Chat**, **Exercises**, **Shared Folder** and **Coach Notes**.

## "Flagged as cancelling"
If a student has asked to cancel, you'll see **⚠ Flagged as cancelling** with their reason and when billing ends. If you can talk them into staying, let the admin know.

Your Dashboard also shows **Makeups Expiring Soon** and **Birthdays This Week** under today's schedule.$md$, 10, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-chatting-with-students', 'coach-students', $t$Chatting with students$t$, $s$Message a student, and how you get notified.$s$, $md$## Where
Open the student's panel on your **Dashboard** and use **Chat**. (There's also a full chat page at **/coach/chat** with all your students in a sidebar.)

## How
- Type in **Type a message…**, press **Enter** to send (**Shift + Enter** for a new line).
- Tap **Attach** for photos or files — in a brand-new conversation, send a text first.

## Notifications
When a student messages you, you'll get an **email** (and a **Slack** message on your personal channel, if set up) — at most one every 15 minutes per student.$md$, 20, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-substitute-lessons', 'coach-students', $t$Covering (substitute) lessons$t$, $s$When you teach another coach's student.$s$, $md$The admin can move a single lesson to another coach — for example when a coach is away.

- The lesson shows on **your** calendar and counts toward **your** pay.
- It doesn't change the student's regular coach or their weekly schedule.
- Chat messages from that student still go to their **regular** coach.$md$, 30, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-how-pay-works', 'coach-pay', $t$How pay works$t$, $s$What counts as a paid session.$s$, $md$**Pay = your hourly rate × lesson length.**

## Paid
- **Attended**
- **No-show**
- **Late-forfeit** (the student cancelled too late)
- **Cancelled without notice**

## Not paid
- **Cancelled with notice** — the student gets a make-up, and the make-up lesson is paid when it happens.
- **Unmarked sessions** — nothing is paid until attendance is marked. See [Marking attendance](/coach/help/a/coach-marking-attendance).

## Also
- **Group lessons** are paid **once per lesson**, however many students attend.
- **Referral bonus:** +$10/hr for students you referred.

Questions about your pay? Ask Mel to pass them to the admin.$md$, 10, true, 'coaches')
  on conflict (slug) do nothing;

insert into support_kb_articles (slug, category, title, summary, body, sort_order, is_public, audience)
  values ('coach-viewing-your-payroll', 'coach-pay', $t$Viewing your payroll$t$, $s$Estimates and finalized pay runs.$s$, $md$Open **Payroll** in the top menu.

- Pick **From** and **To** dates and tap **Apply** (it starts on the current month).
- **Estimate for this period** — every session with date, student, status, length and amount, plus an **Estimated total**.
- **Finalized pay runs** — each pay period with its amount and status (**Paid** or **Pending**).

When a new pay run is ready, your Dashboard shows a **New payroll ready** banner — tap **View payroll →**.

On **My Schedule**, the summary also shows **Paid sessions** and a **Payroll total** for whatever dates the calendar is showing.$md$, 20, true, 'coaches')
  on conflict (slug) do nothing;
