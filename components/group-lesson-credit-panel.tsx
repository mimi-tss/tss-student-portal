"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormattedDateTime } from "@/components/formatted-time";
import styles from "../app/(student)/student.module.css";

export interface RedeemableOption {
  id: string;
  scheduledAt: string;
  coachName: string;
  spotsLeft: number | null;
}

export interface CreditWithOptions {
  creditId: string;
  topic: string;
  expiresAt: string | null;
  options: RedeemableOption[];
}

// One card per group-lesson credit (migration 0086) the student is
// holding — granted only when the studio itself cancelled an
// understaffed class they were in, never from a self-cancel (no such
// path exists for group lessons). Lists other future occurrences of the
// SAME topic to register into directly, spending the credit — the
// student's self-service counterpart to admin's manual register flow.
export default function GroupLessonCreditPanel({ credits }: { credits: CreditWithOptions[] }) {
  const router = useRouter();
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (credits.length === 0) return null;

  async function register(creditId: string, groupLessonId: string) {
    setRegisteringId(groupLessonId);
    setError(null);

    const res = await fetch("/api/student/group-lessons/redeem-credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creditId, groupLessonId }),
    });
    const body = await res.json().catch(() => ({}));
    setRegisteringId(null);

    if (!res.ok) {
      setError(body.error ?? "Couldn't register for that class.");
      return;
    }

    router.refresh();
  }

  return (
    <div className={styles.panel} style={{ marginTop: 32, marginBottom: 24 }}>
      <h2>Group class credits</h2>
      {error && <p className={styles.errorText}>{error}</p>}
      <ul className={styles.sessionList}>
        {credits.map((c) => (
          <li key={c.creditId} className={styles.sessionListItem}>
            <p className={styles.statValue} style={{ margin: "0 0 8px" }}>
              {c.topic}
            </p>
            {c.options.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.75 }}>
                No upcoming &quot;{c.topic}&quot; classes are open yet — contact the studio to be added to one when it's
                scheduled.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {c.options.map((o) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span>
                      <FormattedDateTime value={o.scheduledAt} /> with {o.coachName}
                      {o.spotsLeft !== null && ` · ${o.spotsLeft} spot${o.spotsLeft === 1 ? "" : "s"} left`}
                    </span>
                    <button
                      onClick={() => register(c.creditId, o.id)}
                      disabled={registeringId !== null}
                      className={styles.linkBtn}
                    >
                      {registeringId === o.id ? "Registering…" : "Register"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
