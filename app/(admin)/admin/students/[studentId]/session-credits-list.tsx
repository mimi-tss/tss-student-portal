"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormattedDate } from "@/components/formatted-time";
import { creditDisplayName, creditTypeLabel } from "@/lib/booking/credit-display";
import styles from "../../../admin.module.css";

interface Credit {
  id: string;
  type: string;
  expires_at: string | null;
  reason: string | null;
  duration_minutes: number | null;
}

// Admin/admin_finance can now correct an unused credit's expiry date or
// remove one outright (a typo'd date on grant, or an accidental
// duplicate) — previously this list was pure display, book-only. Scoped
// server-side to unused credits only (see the two routes this calls) —
// this page's own query already only ever fetches unused, unexpired
// ones, so that's not a new restriction here, just consistent with it.
export default function SessionCreditsList({
  studentId,
  credits,
  defaultDurationMinutes,
}: {
  studentId: string;
  credits: Credit[];
  defaultDurationMinutes: number;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(c: Credit) {
    setError(null);
    setEditingId(c.id);
    setExpiresAt(c.expires_at ? c.expires_at.slice(0, 10) : "");
  }

  async function saveEdit(creditId: string) {
    if (!expiresAt) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/update-credit-expiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creditId, expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString() }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not update expiry date.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(creditId: string) {
    if (!window.confirm("Delete this session credit? This can't be undone.")) return;
    setDeletingId(creditId);
    setError(null);
    const res = await fetch("/api/admin/delete-credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creditId }),
    });
    setDeletingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete credit.");
      return;
    }
    router.refresh();
  }

  if (credits.length === 0) {
    return <p className={styles.mutedText}>None available.</p>;
  }

  return (
    <>
      {error && (
        <p className={styles.errorText} style={{ marginBottom: 8 }}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {credits.map((c) => (
          <li key={c.id} className={styles.listItem}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <p>
                  {creditDisplayName(c.duration_minutes ?? defaultDurationMinutes)}
                  {" — "}
                  {editingId === c.id ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="date"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        className={styles.inputSmall}
                      />
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={saving || !expiresAt}
                        className={styles.linkBtnSmall}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditingId(null)} disabled={saving} className={styles.linkBtnSmall}>
                        Cancel
                      </button>
                    </span>
                  ) : c.expires_at ? (
                    <>
                      expires <FormattedDate value={c.expires_at} />
                    </>
                  ) : (
                    "no expiration"
                  )}
                </p>
                <p className={styles.mutedText}>
                  {creditTypeLabel(c.type)}
                  {c.reason ? ` - ${c.reason}` : ""}
                </p>
              </div>
              {editingId !== c.id && (
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Link href={`/admin/students/${studentId}/book?creditId=${c.id}`} className={styles.linkBtnSmall}>
                    Book
                  </Link>
                  <button onClick={() => startEdit(c)} className={styles.linkBtnSmall}>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className={styles.dangerLink}
                  >
                    {deletingId === c.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
