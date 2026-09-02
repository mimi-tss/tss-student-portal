"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface NotificationRow {
  id: string;
  group_key: "digest" | "alerts";
  kind: string;
  title: string;
  body: string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

// Refresh-on-load only, no polling/realtime — this app has no
// realtime/websocket usage anywhere, and per the studio's own call this
// doesn't need one either (in-app notifications aren't time-critical the
// way the actual reminder itself, sent via email/SMS/Slack, is).
export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((body) => setNotifications(body.notifications ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--coral)] px-1 text-[10px] font-bold text-[var(--coral-text)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+10px)] z-20 max-h-[400px] w-[320px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--text)]">Notifications</span>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-[var(--text-muted)] underline">
                  Mark all read
                </button>
              )}
            </div>
            {!loaded ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Nothing yet.</p>
            ) : (
              notifications.map((n) => {
                const item = (
                  <div
                    className={`border-b border-[var(--border)] px-4 py-3 last:border-b-0 ${n.read_at ? "" : "bg-[var(--surface-2)]"}`}
                  >
                    <p className="text-sm font-medium text-[var(--text)]">{n.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{n.body}</p>
                  </div>
                );
                return n.link_url ? (
                  <Link key={n.id} href={n.link_url} onClick={() => markRead(n.id)} className="block">
                    {item}
                  </Link>
                ) : (
                  <button key={n.id} type="button" onClick={() => markRead(n.id)} className="block w-full text-left">
                    {item}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
