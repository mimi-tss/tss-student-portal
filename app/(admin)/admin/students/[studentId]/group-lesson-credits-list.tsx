"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormattedDate } from "@/components/formatted-time";
import styles from "../../../admin.module.css";

interface GroupLessonCredit {
  id: string;
  topic: string;
  expires_at: string | null;
  reason: string | null;
  created_at: string;
}

// Admin-side visibility for group_lesson_credits (migration 0086) — until
// now the only place any of these ever showed up was the student's own
// booking page (GroupLessonCreditPanel), matched by topic against future
// occurrences. Admin had no way to confirm a credit they'd just issued
// (from cancel-group-lesson or the per-attendee Remove) actually landed —
// same table, same "unused, unexpired" scoping as SessionCreditsList's
// own makeup_credits query, just the group-lesson counterpart. No
// Book/Edit here: there's no admin-side redemption flow for these yet
// (only the student's own self-serve one), just Delete for a mistaken
// grant.
export default function GroupLessonCreditsList({ credits }: { credits: GroupLessonCredit[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(creditId: string) {
    if (!window.confirm("Delete this group class credit? This can't be undone.")) return;
    setDeletingId(creditId);
    setError(null);
    const res = await fetch("/api/admin/delete-group-lesson-credit", {
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
                  {c.topic}
                  {" — "}
                  {c.expires_at ? (
                    <>
                      expires <FormattedDate value={c.expires_at} />
                    </>
                  ) : (
                    "no expiration"
                  )}
                </p>
                <p className={styles.mutedText}>
                  granted <FormattedDate value={c.created_at} />
                  {c.reason ? ` — ${c.reason}` : ""}
                </p>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={deletingId === c.id}
                className={styles.dangerLink}
                style={{ flexShrink: 0 }}
              >
                {deletingId === c.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
