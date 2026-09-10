"use client";

import { useEffect, useState } from "react";
import styles from "../../student.module.css";

// Only visible starting 10 minutes before the session and until it ends
// — re-checks every 15s so it appears on its own without a page reload.
const EARLY_JOIN_MINUTES = 10;

export default function JoinButton({
  kind,
  sessionId,
  scheduledAt,
  durationMinutes,
  meetLink,
}: {
  // Which table sessionId refers to — the join-click endpoint checks
  // ownership against a different table for each, and the resulting
  // activity_events row is tagged accordingly.
  kind: "session" | "group_lesson";
  sessionId: string;
  scheduledAt: string;
  durationMinutes: number;
  meetLink: string;
}) {
  // joinable === null means "session is over" (past end time) — still
  // hides entirely then, same as before. Before that, the button always
  // renders; only whether it's clickable changes, per direct request —
  // seeing it ahead of time (just disabled) reads better than it
  // popping into existence with no warning right at the 10-minute mark.
  const [joinable, setJoinable] = useState<boolean | null>(false);

  useEffect(() => {
    function check() {
      const start = new Date(scheduledAt).getTime();
      const end = start + durationMinutes * 60 * 1000;
      const now = Date.now();
      if (now > end) {
        setJoinable(null);
      } else {
        setJoinable(now >= start - EARLY_JOIN_MINUTES * 60 * 1000);
      }
    }
    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, [scheduledAt, durationMinutes]);

  if (joinable === null) return null;

  // The portal itself is framed inside Kajabi's site (see login-form.tsx's
  // own ensureStorageAccess comment). Two approaches were already tried
  // and each failed in a DIFFERENT real client, so this is now a genuine
  // `<a>` rather than either:
  //   - `<a target="_blank">` (the original implementation): asks the
  //     browser for a popup. On mobile Safari nested in this iframe, that
  //     popup doesn't reliably open as a clean top-level page — Meet's
  //     servers still respond, but with nowhere sane to render it the
  //     browser offers Meet's raw JSON as a "download this file" prompt.
  //     Confirmed live on real mobile Safari group-class students.
  //   - a scripted `window.top.location.href` write (2026-09-09 fix):
  //     solved the Safari case, but confirmed NOT reliable everywhere —
  //     Ayla's Join button did nothing at all, while pasting the same
  //     literal meet link into chat (a real clicked `<a target="_blank">`
  //     there) let her straight into the same lesson. Some real client
  //     silently blocks a SCRIPTED top-frame navigation from inside a
  //     nested iframe (a common anti-clickjacking restriction) while
  //     still allowing a genuinely user-clicked link through.
  // `target="_top"` on a real anchor gets the best of both: like `_blank`
  // it's a native, browser-handled link click (not a script write), but
  // like the window.top fix it navigates the EXISTING top-level frame in
  // place rather than requesting a new popup — no popup-blocker heuristics
  // to trip, no scripted top-nav for a stricter client to silently refuse.
  function handleBeacon() {
    // Best-effort dispute evidence ("did they actually click Join") —
    // sendBeacon fires without waiting for a response, so it can't delay
    // the click's own native navigation.
    try {
      const payload = new Blob([JSON.stringify({ sessionId, kind })], { type: "application/json" });
      navigator.sendBeacon("/api/student/join-click", payload);
    } catch {
      // never block the actual join action over a logging failure
    }
  }

  if (!joinable) {
    return (
      <button type="button" disabled className={styles.joinBtn} title={`Available ${EARLY_JOIN_MINUTES} minutes before your session`}>
        Join session
      </button>
    );
  }

  return (
    <a href={meetLink} target="_top" rel="noopener" onClick={handleBeacon} className={styles.joinBtn}>
      Join session
    </a>
  );
}
