"use client";

import { useEffect, useState } from "react";
import styles from "../../admin.module.css";

interface Exercise {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  active: boolean;
  created_at: string;
}

export default function ExercisesClient() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/exercises")
      .then((res) => res.json())
      .then((data) => setExercises(data.exercises ?? []));
  }

  useEffect(load, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncMessage(null);

    const res = await fetch("/api/admin/exercises/sync", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setSyncing(false);

    if (!res.ok) {
      setError(body.error ?? "Sync failed.");
      return;
    }

    setSyncMessage(`Synced — ${body.added} added, ${body.deactivated} removed, ${body.total} in Drive now.`);
    load();
  }

  async function handleToggle(id: string, active: boolean) {
    await fetch(`/api/admin/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    load();
  }

  return (
    <div>
      <div className={styles.panel} style={{ maxWidth: 480 }}>
        <h2>Sync from Drive</h2>
        <p className={styles.panelText} style={{ marginBottom: 12 }}>
          Add or remove audio files in the shared exercises Drive folder, then sync — this app
          doesn&rsquo;t upload files directly.
        </p>
        {error && <p className={styles.errorText} style={{ marginBottom: 8 }}>{error}</p>}
        {syncMessage && <p className={styles.successText} style={{ marginBottom: 8 }}>{syncMessage}</p>}
        <button
          onClick={handleSync}
          disabled={syncing}
          className={styles.cta}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exercises.map((ex) => (
            <tr key={ex.id}>
              <td className={styles.rowName}>{ex.title}</td>
              <td>
                {ex.active ? (
                  <span className={styles.successText}>In catalog</span>
                ) : (
                  <span className={styles.mutedText}>Hidden</span>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                <button onClick={() => handleToggle(ex.id, !ex.active)} className={styles.linkBtnSmall}>
                  {ex.active ? "Hide" : "Show"}
                </button>
              </td>
            </tr>
          ))}
          {exercises.length === 0 && (
            <tr>
              <td colSpan={3} className={styles.emptyState}>
                No exercises synced yet — click &ldquo;Sync now&rdquo;.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
