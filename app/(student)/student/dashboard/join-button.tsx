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
  // own ensureStorageAccess comment). A same-tab `<a target="_blank">`
  // click inside that iframe asks the BROWSER to spawn a popup — on
  // mobile Safari that's exactly the kind of window.open Safari's popup
  // blocker treats as untrusted once it's nested inside someone else's
  // iframe, and when it doesn't cleanly open a real new tab, Meet's own
  // app shell never loads into a proper top-level page — the request
  // still round-trips Meet's servers, but what comes back is Meet's raw
  // API payload, which a browser with nowhere sane to render it just
  // offers as a "download this file" prompt. Group-class students on
  // real mobile Safari hit exactly this.
  //
  // Fix: don't ask for a popup at all — navigate the TOP-LEVEL window
  // straight to the Meet link, breaking out of Kajabi's iframe entirely.
  // Writing a cross-origin window.top.location is allowed as a
  // user-activation top navigation (this click is exactly that); it's
  // the same escape hatch framebusting code relies on. Meet then loads
  // as a normal, unframed page in the real browser — which is all it
  // ever needed.
  function handleClick() {
    // Best-effort dispute evidence ("did they actually click Join") —
    // sendBeacon fires without waiting for a response, so it can't
    // delay the navigation below it.
    try {
      const payload = new Blob([JSON.stringify({ sessionId, kind })], { type: "application/json" });
      navigator.sendBeacon("/api/student/join-click", payload);
    } catch {
      // never block the actual join action over a logging failure
    }

    try {
      (window.top ?? window).location.href = meetLink;
    } catch {
      window.location.href = meetLink;
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
    <button type="button" onClick={handleClick} className={styles.joinBtn}>
      Join session
    </button>
  );
}
