"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "../../coach.module.css";

const TIER_LABEL: Record<string, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

export default function StudentsListClient({
  students,
}: {
  students: { id: string; name: string; tier: string }[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, query]);

  return (
    <>
      <input
        type="text"
        className={styles.input}
        placeholder="Search students…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12, width: "100%", maxWidth: 320 }}
      />
      {filtered.length === 0 ? (
        <p className={styles.panelText}>No students match "{query}".</p>
      ) : (
        <ul className={styles.list}>
          {filtered.map((s) => (
            <li key={s.id} className={styles.listItem}>
              <Link
                href={`/coach/dashboard?student=${s.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span className={styles.statValue}>{s.name}</span>
                <span className={styles.badge}>{TIER_LABEL[s.tier] ?? s.tier}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
