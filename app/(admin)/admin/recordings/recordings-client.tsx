"use client";

import { useEffect, useState } from "react";
import styles from "../../admin.module.css";

interface Candidate {
  id: string;
  scheduledAt: string;
  studentId: string;
  studentName: string;
}

interface RecordingItem {
  id: string;
  fileName: string;
  recordedDate: string;
  driveCreatedAt: string;
  coachId: string | null;
  coachName: string | null;
  candidates: Candidate[];
}

export default function RecordingsClient() {
  const [items, setItems] = useState<RecordingItem[] | null>(null);
  const [autoMatched, setAutoMatched] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Plain read now — no more scan/match work inline, so no .catch is
  // strictly load-bearing anymore, but kept anyway as a safety net.
  function load() {
    setItems(null);
    setError(null);
    fetch("/api/admin/meet-recordings")
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setError("Couldn't load recordings — try again."));
  }

  useEffect(load, []);

  // The slow scan + name/day-match pass this page used to run on every
  // load — split out so it can't block the list from ever rendering
  // (confirmed live: that pass alone could take 10-25s+ and reliably
  // failed outright, leaving the manual picker below unusable). Runs
  // automatically every 2 hours in the background regardless
  // (.github/workflows/scan-recordings.yml); this button is only for
  // "check right now" instead of waiting for the next scheduled pass.
  async function rescan() {
    setRescanning(true);
    setError(null);
    const res = await fetch("/api/admin/meet-recordings/rescan", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setRescanning(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't check for new recordings — try again.");
      return;
    }
    setAutoMatched(data.autoMatched ?? 0);
    load();
  }

  async function confirm(recordingId: string) {
    const sessionId = selected[recordingId];
    if (!sessionId) return;
    setBusyId(recordingId);
    setError(null);
    const res = await fetch("/api/admin/meet-recordings/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId, sessionId }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Couldn't match that recording.");
      return;
    }
    load();
  }

  async function dismiss(recordingId: string) {
    setBusyId(recordingId);
    setError(null);
    const res = await fetch("/api/admin/meet-recordings/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't dismiss that recording.");
      return;
    }
    load();
  }

  return (
    <div className={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <p className={styles.panelText}>
          Recordings Meet couldn&apos;t be confidently matched to a student on its own — pick the right session, or
          dismiss if it&apos;s not a lesson recording (an internal meeting, a personal call). New recordings are
          checked automatically every 2 hours.
        </p>
        <button className={styles.linkBtnSmall} disabled={rescanning} onClick={rescan} style={{ flexShrink: 0 }}>
          {rescanning ? "Checking…" : "Check now"}
        </button>
      </div>
      {autoMatched > 0 && (
        <p className={styles.panelText}>
          {autoMatched} recording{autoMatched === 1 ? "" : "s"} matched automatically just now.
        </p>
      )}
      {error && (
        <p className={styles.panelText} style={{ color: "#c0392b" }}>
          {error}{" "}
          <button onClick={load} className={styles.linkBtnSmall}>
            Try again
          </button>
        </p>
      )}

      {!error && items === null && <p className={styles.panelText}>Loading…</p>}
      {!error && items && items.length === 0 && <p className={styles.emptyState}>Nothing unmatched right now.</p>}

      {items?.map((item) => (
        <div key={item.id} className={styles.naRow}>
          <div className={styles.naInfo}>
            <div className={styles.naName}>{item.fileName}</div>
            <div className={styles.naSummary}>
              {item.coachName ?? "Unrecognized coach"} · {item.recordedDate}
            </div>
            {item.coachId ? (
              item.candidates.length > 0 ? (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    className={styles.inputSmall}
                    value={selected[item.id] ?? ""}
                    onChange={(e) => setSelected((s) => ({ ...s, [item.id]: e.target.value }))}
                  >
                    <option value="">Select the student…</option>
                    {item.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.studentName} — {new Date(c.scheduledAt).toLocaleTimeString()}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.linkBtnSmall}
                    disabled={!selected[item.id] || busyId === item.id}
                    onClick={() => confirm(item.id)}
                  >
                    Confirm
                  </button>
                </div>
              ) : (
                <div className={styles.naSummary}>No attended, unmatched sessions found that day.</div>
              )
            ) : (
              <div className={styles.naSummary}>Couldn&apos;t tell which coach this belongs to.</div>
            )}
          </div>
          <button className={styles.dangerBtn} disabled={busyId === item.id} onClick={() => dismiss(item.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
