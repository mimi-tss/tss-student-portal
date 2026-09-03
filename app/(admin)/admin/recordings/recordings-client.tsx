"use client";

import { useEffect, useState } from "react";
import styles from "../../admin.module.css";

interface Candidate {
  id: string;
  scheduledAt: string;
  studentId: string;
  studentName: string;
}

interface GroupLessonCandidate {
  id: string;
  scheduledAt: string;
  topic: string | null;
  studentCount: number;
}

interface RecordingItem {
  id: string;
  driveFileId: string;
  fileName: string;
  recordedDate: string;
  driveCreatedAt: string;
  coachId: string | null;
  coachName: string | null;
  candidates: Candidate[];
  groupLessonCandidates: GroupLessonCandidate[];
}

// Encodes which picker option was chosen into one <select> value, since
// a recording's manual match can go to either a 1:1 session or a group
// lesson from the same dropdown — "s:<id>" / "g:<id>" rather than two
// separate selects that could each independently hold a stale value
// after the other one is picked.
function encodeOption(kind: "s" | "g", id: string) {
  return `${kind}:${id}`;
}
function decodeOption(value: string): { kind: "s" | "g"; id: string } | null {
  const [kind, id] = value.split(":");
  if ((kind !== "s" && kind !== "g") || !id) return null;
  return { kind, id };
}

export default function RecordingsClient() {
  const [items, setItems] = useState<RecordingItem[] | null>(null);
  const [autoMatched, setAutoMatched] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  // Neither confirm nor dismiss caught a failed fetch/non-JSON response
  // before this — a thrown Drive-side error (now returned as a normal
  // JSON error, see attachRecordingToStudent's own fix) or any other
  // failure to reach/parse the response left busyId stuck and nothing
  // visibly happening: the exact "Confirm does nothing" symptom.
  async function confirm(recordingId: string) {
    const option = decodeOption(selected[recordingId] ?? "");
    if (!option) return;
    setBusyId(recordingId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        option.kind === "s" ? "/api/admin/meet-recordings/match" : "/api/admin/meet-recordings/match-group",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            option.kind === "s"
              ? { recordingId, sessionId: option.id }
              : { recordingId, groupLessonId: option.id },
          ),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't match that recording.");
        return;
      }
      if (option.kind === "g") {
        const skipped: string[] = data.skipped ?? [];
        setNotice(
          skipped.length > 0
            ? `Sent to ${data.notified ?? 0} student(s). Couldn't reach: ${skipped.join(", ")}.`
            : `Sent to ${data.notified ?? 0} student(s).`,
        );
      }
      load();
    } catch {
      setError("Couldn't match that recording — try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(recordingId: string) {
    setBusyId(recordingId);
    setError(null);
    try {
      const res = await fetch("/api/admin/meet-recordings/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't dismiss that recording.");
        return;
      }
      load();
    } catch {
      setError("Couldn't dismiss that recording — try again.");
    } finally {
      setBusyId(null);
    }
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
      {notice && <p className={styles.panelText}>{notice}</p>}

      {!error && items === null && <p className={styles.panelText}>Loading…</p>}
      {!error && items && items.length === 0 && <p className={styles.emptyState}>Nothing unmatched right now.</p>}

      {items?.map((item) => (
        <div key={item.id} className={styles.naRow}>
          <div className={styles.naInfo}>
            <a
              href={`https://drive.google.com/file/d/${item.driveFileId}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.naName} ${styles.rowName}`}
            >
              {item.fileName}
            </a>
            <div className={styles.naSummary}>
              {item.coachName ?? "Unrecognized coach"} · {item.recordedDate}
            </div>
            {item.coachId ? (
              item.candidates.length > 0 || item.groupLessonCandidates.length > 0 ? (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    className={styles.inputSmall}
                    value={selected[item.id] ?? ""}
                    onChange={(e) => setSelected((s) => ({ ...s, [item.id]: e.target.value }))}
                  >
                    <option value="">Select the student or group class…</option>
                    {item.candidates.map((c) => (
                      <option key={encodeOption("s", c.id)} value={encodeOption("s", c.id)}>
                        {c.studentName} — {new Date(c.scheduledAt).toLocaleTimeString()}
                      </option>
                    ))}
                    {item.groupLessonCandidates.map((g) => (
                      <option key={encodeOption("g", g.id)} value={encodeOption("g", g.id)}>
                        [Group] {g.topic || "Group Lesson"} — {new Date(g.scheduledAt).toLocaleTimeString()} ·{" "}
                        {g.studentCount} student{g.studentCount === 1 ? "" : "s"}
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
                <div className={styles.naSummary}>No attended sessions or group classes found that day.</div>
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
