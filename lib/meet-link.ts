// A coach's meet_link is shared broadly — every student booked with them
// opens the same room — but it's often pasted straight from an active
// browser tab rather than copied fresh from Google Meet, which carries
// session-specific query params (`?pli=1&authuser=1`, etc.) that are
// meaningless, or actively wrong, for anyone else who clicks it
// (`authuser=1` tells Meet to use the CLICKER's own second Google
// account, not the coach's). Strips query string and hash from any
// http(s) URL before it's saved; anything that isn't a valid URL is left
// untouched rather than rejected — this is hygiene, not validation.
export function sanitizeMeetLink(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`;
  } catch {
    return trimmed;
  }
}
