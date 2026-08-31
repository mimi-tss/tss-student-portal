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

  function handleClick() {
    // Best-effort dispute evidence ("did they actually click Join") —
    // sendBeacon fires without waiting for a response, so it can't
    // delay the tab opening below it.
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
    <a href={meetLink} target="_blank" rel="noopener noreferrer" className={styles.joinBtn} onClick={handleClick}>
      Join session
    </a>
  );
}
