"use client";

import { useEffect, useState } from "react";
import styles from "../../admin.module.css";
import { summarizeDiff } from "@/lib/admin/diff-summary";

interface AuditLogRow {
  id: string;
  table_name: string;
  row_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  actorName: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
}

interface EventRow {
  id: string;
  event_type: "login" | "join_click";
  actor_id: string;
  actorName: string;
  method: string | null;
  session_id: string | null;
  group_lesson_id: string | null;
  occurred_at: string;
}

const AUDITED_TABLES = [
  "students",
  "coaches",
  "recurring_schedules",
  "coach_blocks",
  "recurring_coach_blocks",
  "makeup_credits",
  "sessions",
  "student_requests",
];

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function ActivityLogClient() {
  const [tab, setTab] = useState<"changes" | "events">("changes");
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [actorNameInput, setActorNameInput] = useState("");
  const [actorName, setActorName] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<(AuditLogRow | EventRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced — a name search walks every auth.users page server-side
  // to catch admin/admin_finance accounts (see searchActorIdsByName),
  // not worth re-running on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setActorName(actorNameInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [actorNameInput]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ view: tab, page: String(page) });
    if (tab === "changes") {
      if (tableFilter !== "all") params.set("table", tableFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
    } else {
      if (eventTypeFilter !== "all") params.set("eventType", eventTypeFilter);
    }
    if (actorName) params.set("actorName", actorName);
    if (start) params.set("start", new Date(`${start}T00:00:00Z`).toISOString());
    if (end) params.set("end", new Date(`${end}T23:59:59.999Z`).toISOString());

    fetch(`/api/admin/activity-log?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [tab, tableFilter, actionFilter, eventTypeFilter, actorName, start, end, page]);

  function switchTab(next: "changes" | "events") {
    setTab(next);
    setPage(1);
    setExpandedId(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => switchTab("changes")}
          className={tab === "changes" ? styles.cta : styles.linkBtn}
        >
          Data changes
        </button>
        <button
          onClick={() => switchTab("events")}
          className={tab === "events" ? styles.cta : styles.linkBtn}
        >
          Logins &amp; joins
        </button>
      </div>

      <div className={styles.panel}>
        <div className={styles.rowForm}>
          {tab === "changes" ? (
            <>
              <div className={styles.field}>
                <label>Table</label>
                <select value={tableFilter} onChange={(e) => { setTableFilter(e.target.value); setPage(1); }} className={styles.select}>
                  <option value="all">All tables</option>
                  {AUDITED_TABLES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Action</label>
                <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className={styles.select}>
                  <option value="all">All actions</option>
                  <option value="INSERT">Insert</option>
                  <option value="UPDATE">Update</option>
                  <option value="DELETE">Delete</option>
                </select>
              </div>
            </>
          ) : (
            <div className={styles.field}>
              <label>Event type</label>
              <select value={eventTypeFilter} onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }} className={styles.select}>
                <option value="all">All events</option>
                <option value="login">Login</option>
                <option value="join_click">Join click</option>
              </select>
            </div>
          )}
          <div className={styles.field}>
            <label>Person</label>
            <input
              type="text"
              value={actorNameInput}
              onChange={(e) => setActorNameInput(e.target.value)}
              placeholder="Student, coach, or admin name"
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>From</label>
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPage(1); }} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>To</label>
            <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPage(1); }} className={styles.input} />
          </div>
        </div>
      </div>

      {loading && <p className={styles.mutedText}>Loading…</p>}

      {!loading && rows.length === 0 && <p className={styles.emptyState}>Nothing found for these filters.</p>}

      {!loading && rows.length > 0 && tab === "changes" && (
        <ul className={styles.list}>
          {(rows as AuditLogRow[]).map((r) => {
            const diffs = summarizeDiff(r.old_data, r.new_data);
            const isOpen = expandedId === r.id;
            return (
              <li key={r.id} className={styles.listItem}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: diffs.length ? "pointer" : "default" }}
                  onClick={() => diffs.length && setExpandedId(isOpen ? null : r.id)}
                >
                  <span>
                    <span className={styles.badge}>{r.action}</span>{" "}
                    <strong>{r.table_name}</strong>{" "}
                    <span className={styles.mutedText}>by {r.actorName}</span>
                  </span>
                  <span className={styles.mutedText}>{new Date(r.changed_at).toLocaleString()}</span>
                </div>
                {isOpen && diffs.length > 0 && (
                  <table style={{ marginTop: 8, width: "100%", fontSize: 13 }}>
                    <tbody>
                      {diffs.map((d) => (
                        <tr key={d.field}>
                          <td className={styles.mutedText} style={{ paddingRight: 12 }}>{d.field}</td>
                          <td className={styles.mutedText}>{formatValue(d.oldValue)}</td>
                          <td className={styles.mutedText} style={{ padding: "0 8px" }}>→</td>
                          <td>{formatValue(d.newValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && rows.length > 0 && tab === "events" && (
        <ul className={styles.list}>
          {(rows as EventRow[]).map((r) => (
            <li key={r.id} className={styles.listItem} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>
                <span className={styles.badge}>
                  {r.event_type === "login" ? "Login" : r.group_lesson_id ? "Join click — Group lesson" : "Join click — Session"}
                </span>{" "}
                <strong>{r.actorName}</strong>
                {r.method && <span className={styles.mutedText}> · {r.method.replace("_", " ")}</span>}
              </span>
              <span className={styles.mutedText}>{new Date(r.occurred_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={styles.linkBtnSmall}>
            Previous
          </button>
          <span className={styles.mutedText}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={styles.linkBtnSmall}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
