// What a group-lesson credit is "for". Studio rule (2026-09-26): a credit
// is good for any class of the same type WITH THE SAME COACH, any day —
// a Nikki Monday credit can book Nikki's Wednesday class, but not
// Celine's. Topics look like "Group Coaching Session - Coach Nikki |
// Monday", so the key is everything before " | " (the day), compared
// case-insensitively ("BOOTCAMP C1" = "Bootcamp C1").
//
// The studio renamed "Semi-Private Vocal Group Class" to "Group Coaching
// Session" on 2026-09-26; credits issued before that still carry the old
// name, so both spellings map to the same key.
//
// Plain module (no server imports) — used by the admin client component
// too.
export function groupCreditKey(topic: string | null | undefined): string {
  return (topic ?? "")
    .split(" | ")[0]
    .toLowerCase()
    .replace(/semi-?private vocal group class/g, "group coaching session")
    .replace(/\s+/g, " ")
    .trim();
}

export function creditMatchesLesson(creditTopic: string | null | undefined, lessonTopic: string | null | undefined): boolean {
  const key = groupCreditKey(creditTopic);
  return key !== "" && key === groupCreditKey(lessonTopic);
}
