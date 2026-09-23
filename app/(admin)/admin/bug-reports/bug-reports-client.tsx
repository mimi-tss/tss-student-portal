"use client";

import { useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import styles from "../../admin.module.css";

export type BugReport = {
  id: string;
  reporterName: string | null;
  reporterRole: string | null;
  email: string;
  message: string;
  pageUrl: string | null;
  userAgent: string | null;
  status: "open" | "resolved";
  createdAt: string;
  screenshots: string[];
};

export default function BugReportsClient({ initialReports }: { initialReports: BugReport[] }) {
  const [reports, setReports] = useState(initialReports);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = reports.filter((r) => r.status === tab);
  const openCount = reports.filter((r) => r.status === "open").length;

  async function setStatus(id: string, status: "open" | "resolved") {
    setBusyId(id);
    const res = await fetch("/api/admin/bug-reports/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Couldn't update this report.");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  return (
    <>
      <div className={styles.lifecycleBar} style={{ marginTop: 0, marginBottom: 20, maxWidth: 360 }}>
        <button
          type="button"
          className={`${styles.lifecycleBtn} ${tab === "open" ? styles.lifecycleBtnActive : ""}`}
          onClick={() => setTab("open")}
        >
          Open ({openCount})
        </button>
        <button
          type="button"
          className={`${styles.lifecycleBtn} ${tab === "resolved" ? styles.lifecycleBtnActive : ""}`}
          onClick={() => setTab("resolved")}
        >
          Resolved ({reports.length - openCount})
        </button>
      </div>

      {visible.length === 0 && <p className={styles.emptyState}>No {tab} bug reports.</p>}

      {visible.map((r) => (
        <div key={r.id} className={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong>{r.reporterName ?? r.email}</strong>{" "}
              {r.reporterRole && <span className={styles.badgeMuted}>{r.reporterRole}</span>}
              <div className={styles.mutedText} style={{ fontSize: 13, marginTop: 4 }}>
                <a href={`mailto:${r.email}`} style={{ color: "inherit" }}>
                  {r.email}
                </a>{" "}
                · <FormattedDateTime value={r.createdAt} />
              </div>
            </div>
            <button
              type="button"
              className={styles.ctaSmall}
              disabled={busyId === r.id}
              onClick={() => setStatus(r.id, r.status === "open" ? "resolved" : "open")}
            >
              {r.status === "open" ? "Mark resolved" : "Reopen"}
            </button>
          </div>

          <p style={{ whiteSpace: "pre-wrap", margin: "14px 0", lineHeight: 1.5 }}>{r.message}</p>

          {r.screenshots.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {r.screenshots.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Screenshot ${i + 1}`}
                    style={{ width: 180, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </a>
              ))}
            </div>
          )}

          <div className={styles.mutedText} style={{ fontSize: 12, wordBreak: "break-all" }}>
            {r.pageUrl && <div>Page: {r.pageUrl}</div>}
            {r.userAgent && <div>Browser: {r.userAgent}</div>}
          </div>
        </div>
      ))}
    </>
  );
}
