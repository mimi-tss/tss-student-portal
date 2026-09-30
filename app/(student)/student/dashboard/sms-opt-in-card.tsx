"use client";

import { useState } from "react";
import styles from "../../student.module.css";

// One-tap opt-in to lesson texts (studio call 2026-09-30). Shown only to
// students with a phone on file, lesson-reminder texts off, and the card
// not dismissed. "Turn on" flips notify_reminders_sms — the same switch as
// Account → Notification preferences → Lesson reminders → Text; ✕ hides the card for good
// (/api/student/sms-prompt). The consent wording (what we text, STOP,
// rates) is there on purpose: carriers expect it for A2P texting.
export default function SmsOptInCard({ phoneLabel }: { phoneLabel: string }) {
  const [state, setState] = useState<"offer" | "done" | "hidden">("offer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turnOn() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/notifications/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify_reminders_sms: true }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't turn on texts. Please try again.");
      return;
    }
    setState("done");
  }

  function dismiss() {
    setState("hidden");
    fetch("/api/student/sms-prompt", { method: "POST" }).catch(() => {});
  }

  if (state === "hidden") return null;

  return (
    <div className={styles.note} style={{ borderLeft: "4px solid var(--gold)", position: "relative", paddingRight: 44 }}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        title="Dismiss"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 28,
          height: 28,
          border: "none",
          background: "transparent",
          color: "var(--text-muted)",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
      <div className={styles.noteFrom}>📱 Text reminders</div>
      {state === "done" ? (
        <p style={{ margin: "6px 0 0" }}>
          You&apos;re all set! We&apos;ll text <strong>{phoneLabel}</strong> before each lesson. You can also get texts for
          bookings and lesson credits in your account&apos;s notification settings.
        </p>
      ) : (
        <>
          <p style={{ margin: "6px 0 10px" }}>
            Never miss a lesson. Get a text at <strong>{phoneLabel}</strong> the day before and 15 minutes before each
            lesson.
          </p>
          <button type="button" className={styles.cta} onClick={turnOn} disabled={busy}>
            {busy ? "Turning on…" : "Turn on text reminders"}
          </button>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Msg &amp; data rates may apply. Reply STOP to opt out.{" "}
            <a href="/billing/account#account" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              Wrong number?
            </a>
          </p>
          {error && <p style={{ margin: "8px 0 0", color: "var(--coral)" }}>{error}</p>}
        </>
      )}
    </div>
  );
}
