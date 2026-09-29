"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

const POLL_MS = 8000;
const QUICK_MINUTES = [3, 5, 8];

interface Pending {
  id: string;
  who: string;
  isMinor: boolean;
  reason: string | null;
  summary: string | null;
  escalatedAt: string | null;
  etaMinutesLeft: number | null;
}

// Short two-note chime via WebAudio (no asset file). Browsers may block
// sound until the admin has clicked somewhere on the page — that's fine,
// the pop-up + tab title still show.
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch {
    // no audio — ignore
  }
}

// Pops up on every admin page when Mel hands a chat to a person
// (support_threads.status = needs_human). The admin can take it over
// right away, or tell the student how long they'll be — 3/5/8 or any
// number of minutes — which updates the student's banner on /help.
export default function SupportAlert() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);
  const baseTitleRef = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/support?pending=1", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const list = ((await res.json()).pending ?? []) as Pending[];
        const seen = seenRef.current;
        // First load just records what's already waiting — only NEW
        // pings chime (not every page navigation).
        if (seen && list.some((p) => !seen.has(p.id) && p.etaMinutesLeft === null)) {
          chime();
          setCollapsed(false);
        }
        seenRef.current = new Set(list.map((p) => p.id));
        setPending(list);
      } catch {
        // offline — try again next tick
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const unacknowledged = pending.filter((p) => p.etaMinutesLeft === null).length;
  useEffect(() => {
    baseTitleRef.current ??= document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unacknowledged ? `(${unacknowledged}) ${baseTitleRef.current}` : baseTitleRef.current;
  }, [unacknowledged, pending]);

  async function act(threadId: string, action: "claim" | "eta", minutes?: number) {
    setBusyId(threadId);
    setError(null);
    const res = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, action, minutes }),
    });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "That didn't work.");
      return;
    }
    if (action === "claim") {
      setPending((prev) => prev.filter((p) => p.id !== threadId));
      router.push(`/admin/support/${threadId}`);
    } else {
      setPending((prev) => prev.map((p) => (p.id === threadId ? { ...p, etaMinutesLeft: minutes ?? null } : p)));
    }
  }

  if (pending.length === 0) return null;

  const box: React.CSSProperties = {
    position: "fixed",
    right: 16,
    bottom: 16,
    width: "min(380px, calc(100vw - 32px))",
    maxHeight: "70vh",
    overflowY: "auto",
    zIndex: 1000,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    margin: 0,
  };

  if (collapsed) {
    return (
      <button type="button" className={styles.ctaSmall} style={{ ...box, width: "auto", maxHeight: "none" }} onClick={() => setCollapsed(false)}>
        💬 {pending.length} support chat{pending.length === 1 ? "" : "s"} waiting
      </button>
    );
  }

  return (
    <div className={styles.panel} style={box} role="alert">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>💬 Mel needs a person</strong>
        <button type="button" className={styles.linkBtnSmall} onClick={() => setCollapsed(true)}>
          Minimize
        </button>
      </div>
      {error && <p className={styles.errorText}>{error}</p>}

      {pending.map((p) => (
        <div key={p.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
          <div>
            <strong>{p.who}</strong> {p.isMinor && <span className={styles.badgeWarn}>Under 18</span>}
          </div>
          {p.reason && <div style={{ fontSize: 14, marginTop: 2 }}>{p.reason}</div>}
          {p.summary && (
            <div className={styles.mutedText} style={{ fontSize: 13, marginTop: 4 }}>
              {p.summary.slice(0, 180)}
            </div>
          )}
          {p.etaMinutesLeft !== null && (
            <div className={styles.mutedText} style={{ fontSize: 13, marginTop: 6 }}>
              Student told: about {p.etaMinutesLeft} min left
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <button type="button" className={styles.ctaSmall} disabled={busyId === p.id} onClick={() => act(p.id, "claim")}>
              Take over now
            </button>
            {QUICK_MINUTES.map((m) => (
              <button key={m} type="button" className={styles.btnGhost} disabled={busyId === p.id} onClick={() => act(p.id, "eta", m)}>
                {m} min
              </button>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}
            onSubmit={(e) => {
              e.preventDefault();
              const m = Number(custom[p.id]);
              if (m >= 1) act(p.id, "eta", m);
            }}
          >
            <input
              type="number"
              min={1}
              max={240}
              placeholder="Other"
              className={styles.inputSmall}
              style={{ width: 80 }}
              value={custom[p.id] ?? ""}
              onChange={(e) => setCustom((c) => ({ ...c, [p.id]: e.target.value }))}
            />
            <span className={styles.mutedText} style={{ fontSize: 13 }}>
              min
            </span>
            <button type="submit" className={styles.btnGhost} disabled={busyId === p.id || !(Number(custom[p.id]) >= 1)}>
              Set wait
            </button>
            <a href={`/admin/support/${p.id}`} className={styles.linkBtnSmall} style={{ marginLeft: "auto" }}>
              View chat
            </a>
          </form>
        </div>
      ))}
    </div>
  );
}
