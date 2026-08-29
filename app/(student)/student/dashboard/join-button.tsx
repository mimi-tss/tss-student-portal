"use client";

import { useEffect, useState } from "react";
import styles from "../../student.module.css";

// Only visible starting 10 minutes before the session and until it ends
// — re-checks every 15s so it appears on its own without a page reload.
const EARLY_JOIN_MINUTES = 10;

export default function JoinButton({
  sessionId,
  scheduledAt,
  durationMinutes,
  meetLink,
}: {
  sessionId: string;
  scheduledAt: string;
  durationMinutes: number;
  meetLink: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function check() {
      const start = new Date(scheduledAt).getTime();
      const end = start + durationMinutes * 60 * 1000;
      const now = Date.now();
      setVisible(now >= start - EARLY_JOIN_MINUTES * 60 * 1000 && now <= end);
    }
    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, [scheduledAt, durationMinutes]);

  if (!visible) return null;

  function handleClick() {
    // Best-effort dispute evidence ("did they actually click Join") —
    // sendBeacon fires without waiting for a response, so it can't
    // delay the tab opening below it.
    try {
      const payload = new Blob([JSON.stringify({ sessionId })], { type: "application/json" });
      navigator.sendBeacon("/api/student/join-click", payload);
    } catch {
      // never block the actual join action over a logging failure
    }
  }

  return (
    <a href={meetLink} target="_blank" rel="noopener noreferrer" className={styles.joinBtn} onClick={handleClick}>
      Join session
    </a>
  );
}
