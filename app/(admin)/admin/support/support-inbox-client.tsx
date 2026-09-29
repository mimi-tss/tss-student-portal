"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import type { AdminThreadRow } from "@/lib/support/admin";
import styles from "../../admin.module.css";

const POLL_MS = 8000;
type Tab = "waiting" | "bot" | "done";

const STATUS_LABEL: Record<AdminThreadRow["status"], string> = {
  bot: "Bot handling",
  needs_human: "Waiting for a person",
  claimed: "With a team member",
  emailed: "Emailed to inbox",
  resolved: "Resolved",
};

function tabOf(t: AdminThreadRow): Tab {
  if (t.status === "needs_human" || t.status === "claimed") return "waiting";
  if (t.status === "bot") return "bot";
  return "done";
}

export default function SupportInboxClient({ initialThreads }: { initialThreads: AdminThreadRow[] }) {
  const [threads, setThreads] = useState(initialThreads);
  const [tab, setTab] = useState<Tab>("waiting");

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch("/api/admin/support", { cache: "no-store" });
      if (res.ok) setThreads((await res.json()).threads);
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const counts = { waiting: 0, bot: 0, done: 0 } as Record<Tab, number>;
  for (const t of threads) counts[tabOf(t)]++;

  // Waiting: queue order (oldest escalation first). Others: most recent.
  const visible = threads
    .filter((t) => tabOf(t) === tab)
    .sort((a, b) =>
      tab === "waiting"
        ? (a.status === "needs_human" ? 0 : 1) - (b.status === "needs_human" ? 0 : 1) ||
          (a.escalatedAt ?? "").localeCompare(b.escalatedAt ?? "")
        : b.updatedAt.localeCompare(a.updatedAt),
    );

  const totalCost = threads.reduce((sum, t) => sum + t.costUsd, 0);

  return (
    <>
      <div className={styles.lifecycleBar} style={{ marginTop: 0, marginBottom: 20, maxWidth: 520 }}>
        {(
          [
            ["waiting", "Needs a person"],
            ["bot", "Bot handling"],
            ["done", "Emailed / resolved"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.lifecycleBtn} ${tab === key ? styles.lifecycleBtnActive : ""}`}
            onClick={() => setTab(key)}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className={styles.emptyState}>Nothing here right now.</p>}

      {visible.map((t, i) => (
        <Link key={t.id} href={`/admin/support/${t.id}`} className={styles.panel} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              {tab === "waiting" && t.status === "needs_human" && <strong>#{i + 1} · </strong>}
              <strong>{t.who}</strong> {t.tier && <span className={styles.badgeMuted}>{t.tier}</span>}{" "}
              {t.isMinor && <span className={styles.badgeWarn}>Under 18</span>}{" "}
              <span className={t.status === "needs_human" ? styles.badgeWarn : styles.badgeMuted}>{STATUS_LABEL[t.status]}</span>
              {t.claimedByName && t.status === "claimed" && <span className={styles.mutedText}> · {t.claimedByName}</span>}
              <div className={styles.mutedText} style={{ fontSize: 13, marginTop: 4 }}>
                {t.email ?? "no email"} · <FormattedDateTime value={t.escalatedAt ?? t.updatedAt} />
              </div>
            </div>
          </div>
          {t.reason && <p style={{ margin: "10px 0 0", fontWeight: 600 }}>{t.reason}</p>}
          {(t.summary || t.lastMessage) && (
            <p className={styles.mutedText} style={{ margin: "6px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>
              {(t.summary ?? t.lastMessage ?? "").slice(0, 240)}
            </p>
          )}
        </Link>
      ))}

      <p className={styles.mutedText} style={{ fontSize: 12, marginTop: 24 }}>
        Approx. AI cost for the {threads.length} chats listed: ${totalCost.toFixed(2)}
      </p>
    </>
  );
}
