"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../student.module.css";

// "Bonus week" card: the student's billing cycle has an extra occurrence
// of their lesson day. Two-step (tap → confirm) so nobody buys by
// accident; the confirm charges the card on file and books the usual slot
// (app/api/student/fifth-week).
export default function FifthWeekCard({
  occurrenceAt,
  whenLabel,
  coachLabel,
  durationMinutes,
  priceLabel,
}: {
  occurrenceAt: string;
  whenLabel: string; // "Wednesday, Sep 30 · 2:30 PM ET"
  coachLabel: string; // "Coach Tara"
  durationMinutes: number;
  priceLabel: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"offer" | "confirm" | "done">("offer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/student/fifth-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occurrenceAt }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong — please try again.");
      return;
    }
    setStep("done");
    router.refresh();
  }

  return (
    <div className={styles.note} style={{ borderLeft: "4px solid var(--gold)" }}>
      <div className={styles.noteFrom}>✨ Bonus week</div>
      {step === "done" ? (
        <p style={{ margin: "6px 0 0" }}>
          You&apos;re booked! <strong>{whenLabel}</strong> with {coachLabel}. A confirmation is on its way.
        </p>
      ) : (
        <>
          <p style={{ margin: "6px 0 10px" }}>
            This billing cycle has an extra lesson day, so your usual time is open: a Private {durationMinutes}-min Coaching
            Session with {coachLabel} on <strong>{whenLabel}</strong>.
          </p>
          {step === "offer" ? (
            <button type="button" className={styles.cta} onClick={() => setStep("confirm")}>
              Add this lesson · {priceLabel}
            </button>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className={styles.cta} onClick={buy} disabled={busy}>
                {busy ? "Booking…" : `Confirm · charge ${priceLabel} to my card`}
              </button>
              <button type="button" className={styles.btnGhost} onClick={() => setStep("offer")} disabled={busy}>
                Not now
              </button>
            </div>
          )}
          {error && <p style={{ margin: "8px 0 0", color: "var(--coral)" }}>{error}</p>}
        </>
      )}
    </div>
  );
}
