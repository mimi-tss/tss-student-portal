"use client";

import { useEffect, useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import { creditDisplayName, creditTypeLabel } from "@/lib/booking/credit-display";
import AdminCancelButtons from "../admin-cancel-buttons";
import styles from "../../../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

interface Credit {
  id: string;
  type: string;
  reason: string | null;
  expires_at: string | null;
  duration_minutes: number | null;
}

interface SessionRow {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  actual_coach_id: string;
  status: string;
  is_makeup: boolean;
}

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  attended: "Attended",
  "no-show": "No-show",
  "late-forfeit": "Late-forfeit",
  "cancelled-with-notice": "Cancelled — notice given",
  "cancelled-no-notice": "Late cancel — no credit",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL);

// datetime-local wants the browser's local wall-clock time with no
// timezone suffix — same round-trip convention already used by
// schedule-client.tsx's own "Add time off" form (new Date(value).toISOString()
// going the other way).
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function coachName(coaches: Coach[], id: string): string {
  return coaches.find((c) => c.id === id)?.name ?? "Unknown coach";
}

// Default "From" to the 1st of the current calendar month — an empty
// default showed every session ever, oldest history buried behind
// however many pages a long-tenured student had. The API itself caps
// "To" at now regardless of what's sent (never future), independent of
// this default.
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// A session's date/time/coach/duration/status, editable inline — shared
// shape for both "Edit" on an existing row and "Add past session" for one
// that never existed in this app at all (e.g. a late cancellation that
// happened entirely in the old app before this student's history lived
// here).
function SessionForm({
  coaches,
  credits,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  coaches: Coach[];
  // Only passed for "Add past session" — a backfilled record can spend an
  // existing unused credit (e.g. one already consumed by this same lesson
  // back in the old app, still showing here as unspent). Editing an
  // already-real session doesn't touch credits at all.
  credits?: Credit[];
  initial: { scheduledAt: string; durationMinutes: number; coachId: string; status: string };
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: {
    scheduledAt: string;
    durationMinutes: number;
    coachId: string;
    status: string;
    note: string;
    creditId: string | null;
  }) => Promise<string | null>;
}) {
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [coachId, setCoachId] = useState(initial.coachId);
  const [status, setStatus] = useState(initial.status);
  const [note, setNote] = useState("");
  const [creditId, setCreditId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCreditChange(id: string) {
    setCreditId(id);
    const credit = credits?.find((c) => c.id === id);
    if (credit?.duration_minutes) setDurationMinutes(credit.duration_minutes);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const err = await onSubmit({ scheduledAt, durationMinutes, coachId, status, note, creditId: creditId || null });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <div className={styles.panel} style={{ background: "var(--surface-2)", marginTop: 8, marginBottom: 0, padding: 12 }}>
      <div className={styles.rowForm}>
        <div className={styles.field}>
          <label>Date &amp; time</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Duration</label>
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className={styles.select}
          >
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Coach</label>
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={styles.select}>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.select}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {credits && (
          <div className={styles.field}>
            <label>Use a credit (optional)</label>
            <select value={creditId} onChange={(e) => handleCreditChange(e.target.value)} className={styles.select}>
              <option value="">None</option>
              {credits.map((c) => (
                <option key={c.id} value={c.id}>
                  {creditDisplayName(c.duration_minutes ?? 30)} — {creditTypeLabel(c.type)}
                  {c.expires_at ? ` (expires ${new Date(c.expires_at).toLocaleDateString()})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className={styles.field} style={{ marginTop: 8 }}>
        <label>Note (optional — logged to the admin audit trail)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Why this record exists or changed, if not obvious"
          className={styles.input}
          style={{ display: "block", width: "100%" }}
        />
      </div>
      {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button onClick={handleSubmit} disabled={saving || !coachId} className={styles.ctaSmall}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button onClick={onCancel} disabled={saving} className={styles.linkBtnSmall}>
          Never mind
        </button>
      </div>
    </div>
  );
}

export default function SessionHistoryClient({
  studentId,
  coaches,
  monthlyCreditsUsed,
  yearlyCreditsUsed,
  credits,
}: {
  studentId: string;
  coaches: Coach[];
  monthlyCreditsUsed: number;
  yearlyCreditsUsed: number;
  credits: Credit[];
}) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ studentId, page: String(page) });
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());

    const res = await fetch(`/api/admin/session-history?${params}`);
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not load sessions.");
      return;
    }
    setSessions(body.sessions ?? []);
    setTotal(body.total ?? 0);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, from, to, page]);

  async function handleEdit(
    sessionId: string,
    values: {
      scheduledAt: string;
      durationMinutes: number;
      coachId: string;
      status: string;
      note: string;
      creditId: string | null;
    },
  ) {
    const res = await fetch("/api/admin/edit-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        scheduledAt: new Date(values.scheduledAt).toISOString(),
        durationMinutes: values.durationMinutes,
        coachId: values.coachId,
        status: values.status,
        note: values.note,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return body.error ?? "Could not save that session.";
    setEditingId(null);
    await load();
    return null;
  }

  async function handleAdd(values: {
    scheduledAt: string;
    durationMinutes: number;
    coachId: string;
    status: string;
    note: string;
    creditId: string | null;
  }) {
    const res = await fetch("/api/admin/add-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        coachId: values.coachId,
        scheduledAt: new Date(values.scheduledAt).toISOString(),
        durationMinutes: values.durationMinutes,
        status: values.status,
        note: values.note,
        creditId: values.creditId,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return body.error ?? "Could not add that session.";
    setAdding(false);
    setPage(1);
    await load();
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const nowLocal = toDatetimeLocal(new Date().toISOString());

  return (
    <div>
      <div className={styles.panel}>
        <div className={styles.rowForm}>
          <div className={styles.field}>
            <label>From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={styles.input}
            />
          </div>
          {(from || to) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
                setPage(1);
              }}
              className={styles.linkBtnSmall}
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      <div style={{ margin: "12px 0" }}>
        {!adding && (
          <button onClick={() => setAdding(true)} className={styles.linkBtn}>
            + Add past session
          </button>
        )}
        {adding && (
          <SessionForm
            coaches={coaches}
            credits={credits}
            initial={{ scheduledAt: nowLocal, durationMinutes: 30, coachId: coaches[0]?.id ?? "", status: "attended" }}
            submitLabel="Add session"
            onCancel={() => setAdding(false)}
            onSubmit={handleAdd}
          />
        )}
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      {loading && <p className={styles.mutedText}>Loading…</p>}

      {!loading && sessions.length === 0 && (
        <p className={styles.emptyState}>No sessions found for these filters.</p>
      )}

      {!loading && sessions.length > 0 && (
        <ul className={styles.list}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.listItem}>
              {editingId === s.id ? (
                <SessionForm
                  coaches={coaches}
                  initial={{
                    scheduledAt: toDatetimeLocal(s.scheduled_at),
                    durationMinutes: s.duration_minutes,
                    coachId: s.actual_coach_id,
                    status: s.status,
                  }}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(values) => handleEdit(s.id, values)}
                />
              ) : (
                <>
                  <p>
                    <FormattedDateTime value={s.scheduled_at} /> · {s.duration_minutes} min · with{" "}
                    {coachName(coaches, s.actual_coach_id)}
                    {s.is_makeup && <span className={styles.badge} style={{ marginLeft: 6 }}>Makeup</span>}
                  </p>
                  <p className={styles.mutedText} style={{ marginTop: 2 }}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </p>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 16 }}>
                    {s.status === "scheduled" && (
                      <AdminCancelButtons
                        studentId={studentId}
                        sessionId={s.id}
                        scheduledAt={s.scheduled_at}
                        isMakeup={s.is_makeup}
                        monthlyCreditsUsed={monthlyCreditsUsed}
                        yearlyCreditsUsed={yearlyCreditsUsed}
                        onSuccess={load}
                      />
                    )}
                    <button onClick={() => setEditingId(s.id)} className={styles.linkBtnSmall}>
                      Edit
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={styles.linkBtnSmall}>
            Previous
          </button>
          <span className={styles.mutedText}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={styles.linkBtnSmall}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
