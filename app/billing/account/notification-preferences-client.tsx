"use client";

import { useState } from "react";
import styles from "../billing.module.css";

// Per-topic switches (migration 0119, studio call 2026-09-30) — replaced
// the single "Alerts" group so a student can pick e.g. texts for lesson
// reminders only. Text only shows where we ever text (lib/notifications/
// create.ts SMS_KINDS / TOPIC). The in-app bell is always on.
export interface NotificationPrefs {
  notify_reminders_email: boolean;
  notify_reminders_sms: boolean;
  notify_bookings_email: boolean;
  notify_bookings_sms: boolean;
  notify_credits_email: boolean;
  notify_credits_sms: boolean;
  notify_messages_email: boolean;
  notify_recordings_email: boolean;
  notify_digest_email: boolean;
}

type Topic = "reminders" | "bookings" | "credits" | "messages" | "recordings" | "digest";

const TOPICS: { key: Topic; label: string; description: string; sms: boolean }[] = [
  { key: "reminders", label: "Lesson reminders", description: "The day before and 15 minutes before each lesson", sms: true },
  {
    key: "bookings",
    label: "Bookings & changes",
    description: "Lessons booked or cancelled, cancelled group sessions, bonus weeks, missed lessons",
    sms: true,
  },
  { key: "credits", label: "Lesson credits", description: "Credits to book and credits expiring soon", sms: true },
  { key: "messages", label: "Messages from your coach", description: "When your coach or the studio messages you", sms: false },
  { key: "recordings", label: "Recordings", description: "When a new lesson recording is ready", sms: false },
  { key: "digest", label: "Weekly digest", description: "A Monday email with your week ahead and studio news", sms: false },
];

export default function NotificationPreferencesClient({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof NotificationPrefs) {
    const before = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    setError(null);
    const res = await fetch("/api/notifications/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next[key] }),
    });
    setSaving(null);
    if (!res.ok) {
      setPrefs(before); // revert on failure
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that preference.");
    }
  }

  const box = (key: keyof NotificationPrefs, label: string) => (
    <input
      type="checkbox"
      aria-label={label}
      checked={prefs[key]}
      disabled={saving === key}
      onChange={() => toggle(key)}
      style={{ width: 18, height: 18, cursor: "pointer" }}
    />
  );

  return (
    <>
      <div className={styles.tierName} style={{ marginBottom: 12 }}>
        Notification preferences
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontWeight: 600, paddingBottom: 6 }} />
            <th style={{ width: 56, fontWeight: 600, paddingBottom: 6 }}>Email</th>
            <th style={{ width: 56, fontWeight: 600, paddingBottom: 6 }}>Text</th>
          </tr>
        </thead>
        <tbody>
          {TOPICS.map((t) => (
            <tr key={t.key} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 8px 10px 0", verticalAlign: "top" }}>
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div className={styles.statLabel} style={{ fontSize: 13 }}>
                  {t.description}
                </div>
              </td>
              <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                {box(`notify_${t.key}_email` as keyof NotificationPrefs, `${t.label} by email`)}
              </td>
              <td style={{ textAlign: "center", verticalAlign: "middle", color: "var(--text-muted)" }}>
                {t.sms ? box(`notify_${t.key}_sms` as keyof NotificationPrefs, `${t.label} by text`) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.statLabel} style={{ marginTop: 12, fontSize: 13 }}>
        Always sent by email: purchases, receipts, membership changes, and missed-lesson notices. Texts: msg &amp; data rates may
        apply, reply STOP to opt out.
      </p>
      {error && (
        <p className={styles.errorText} style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </>
  );
}
