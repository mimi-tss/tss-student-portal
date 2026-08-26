"use client";

import { useEffect, useState } from "react";
import styles from "../../student.module.css";

// Login streak (mockup copy: "log in tomorrow to keep it going") —
// decided: counts the first real interaction (any button/link click) on
// the dashboard per calendar day, not a bare page load. Listens on the
// document for the first qualifying click, then stops listening — a
// second click this page load doesn't re-ping (the API is idempotent
// per-day anyway, this just avoids a pointless extra request).
export default function StreakPing({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("button, a")) return;
      document.removeEventListener("click", handleClick);
      fetch("/api/student/streak/ping", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.streakCount === "number") setCount(data.streakCount);
        })
        .catch(() => {});
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (count <= 0) return null;

  const lit = Math.min(count, 7);
  const bulbs = Array.from({ length: 7 }, (_, i) => i < lit);

  return (
    <div className={styles.streak}>
      <div>
        <div className={styles.streakLabel}>
          Practice streak — <b>{count} day{count === 1 ? "" : "s"}</b>
        </div>
        <p className={styles.panelText} style={{ marginTop: 4 }}>
          Just for showing up — log in tomorrow to keep it going.
        </p>
      </div>
      <div className={styles.bulbs}>
        {bulbs.map((on, i) => (
          <div key={i} className={on ? `${styles.bulb} ${styles.bulbOn}` : styles.bulb} />
        ))}
      </div>
    </div>
  );
}
