// Coaches are spread across multiple timezones (confirmed, not assumed),
// so working_hours ("09:00"-"17:00") has to be interpreted against each
// coach's own IANA timezone, DST included. Uses the native Intl API
// rather than adding a date library — DST correctness comes from the
// same ICU data Node already ships with.

// How far `date`'s instant is, in minutes, ahead of UTC when read in
// `timeZone` — e.g. +60 for a zone that's UTC+1 at that moment.
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return (asUTC - date.getTime()) / 60_000;
}

// Converts a wall-clock date+time as understood in `timeZone` into the
// correct UTC instant, DST included.
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-indexed
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = getTimeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60_000);
}

// The day-of-week key (per DAY_KEYS elsewhere) and wall-clock hour/minute
// that a UTC instant falls on *in a given timezone* — the inverse
// direction, used when walking calendar days in the coach's own zone
// rather than the server's.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function zonedDayKey(date: Date, timeZone: string): (typeof DAY_KEYS)[number] {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
    .format(date)
    .toLowerCase();
  const map: Record<string, (typeof DAY_KEYS)[number]> = {
    sun: "sun",
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
  };
  return map[weekday.slice(0, 3)];
}

// The wall-clock hour/minute a UTC instant falls on in a given timezone —
// used when a calendar is *displayed* in one zone (e.g. admin viewing
// every coach's schedule normalized to Eastern) but a coach's actual
// working-hours windows are defined in their own, possibly different,
// zone: converts the displayed instant back to the coach's zone to check
// against their working_hours.
export function zonedHourMinute(date: Date, timeZone: string): [number, number] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return [Number(parts.hour), Number(parts.minute)];
}

export function zonedYearMonthDay(date: Date, timeZone: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return [Number(parts.year), Number(parts.month), Number(parts.day)];
}
