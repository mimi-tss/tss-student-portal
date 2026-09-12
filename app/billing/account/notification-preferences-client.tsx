"use client";

import { useState } from "react";
import styles from "../billing.module.css";

export interface NotificationPrefs {
  notify_digest_email: boolean;
  notify_digest_sms: boolean;
  notify_digest_inapp: boolean;
  notify_alerts_email: boolean;
  notify_alerts_sms: boolean;
  notify_alerts_inapp: boolean;
}

const GROUPS: { key: "digest" | "alerts"; label: string; description: string }[] = [
  { key: "digest", label: "Weekly digest", description: "Your week ahead — upcoming sessions, group lessons, credits." },
  {
    key: "alerts",
    label: "Alerts",
    description: "Session starting soon, 24hr reminders, recording ready, unscheduled makeup credits.",
  },
];

const CHANNELS: { key: "email" | "sms" | "inapp"; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "sms", label: "Text" },
  { key: "inapp", label: "In-app" },
];

// Moved here from the student dashboard (was app/(student)/student/
// dashboard/notification-preferences-client.tsx) — this is now the only
// place it renders. Same /api/notifications/preferences route, just
// restyled with billing's own tokens instead of student.module.css.
export default function NotificationPreferencesClient({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(group: "digest" | "alerts", channel: "email" | "sms" | "inapp") {
    const key = `notify_${group}_${channel}` as keyof NotificationPrefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setError(null);
    const res = await fetch("/api/notifications/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next[key] }),
    });
    setSaving(false);
    if (!res.ok) {
      setPrefs(prefs); // revert on failure
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that preference.");
    }
  }

  return (
    <>
      <div className={styles.tierName} style={{ marginBottom: 12 }}>
        Notification preferences
      </div>
      {GROUPS.map((g) => (
        <div key={g.key} style={{ marginTop: g.key === "digest" ? 0 : 16 }}>
          <p style={{ fontWeight: 600, margin: "0 0 2px", fontSize: 14 }}>{g.label}</p>
          <p className={styles.statLabel} style={{ marginBottom: 8 }}>
            {g.description}
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {CHANNELS.map((c) => {
              const key = `notify_${g.key}_${c.key}` as keyof NotificationPrefs;
              return (
                <label key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={prefs[key]} disabled={saving} onChange={() => toggle(g.key, c.key)} />
                  {c.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {error && (
        <p className={styles.errorText} style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </>
  );
}
