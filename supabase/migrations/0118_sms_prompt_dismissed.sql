-- Student dashboard "Get text reminders" card (app/(student)/student/
-- dashboard/sms-opt-in-card.tsx): set when the student taps ✕, so the
-- card stays hidden on every device. Null = never dismissed.
alter table students add column if not exists sms_prompt_dismissed_at timestamptz;
