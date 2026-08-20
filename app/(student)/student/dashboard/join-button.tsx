"use client";

import { useEffect, useState } from "react";
import styles from "../../student.module.css";

// Only visible starting 10 minutes before the session and until it ends
// — re-checks every 15s so it appears on its own without a page reload.
const EARLY_JOIN_MINUTES = 10;

export default function JoinButton({
  scheduledAt,
  durationMinutes,
  meetLink,
}: {
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

  return (
    <a href={meetLink} target="_blank" rel="noopener noreferrer" className={styles.joinBtn}>
      Join session
    </a>
  );
}
