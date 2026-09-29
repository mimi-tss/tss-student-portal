"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./center.module.css";

export interface SearchItem {
  slug: string;
  title: string;
  excerpt: string;
  text: string;
  category: string;
}

// Instant search over every published article (a small list, so it's
// filtered in the browser — no search server needed).
export default function HelpSearch({ items }: { items: SearchItem[] }) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return [];
    return items
      .map((it) => {
        const title = it.title.toLowerCase();
        const text = it.text.toLowerCase();
        let score = 0;
        for (const w of words) {
          if (title.includes(w)) score += 3;
          else if (text.includes(w)) score += 1;
          else return null;
        }
        return { it, score };
      })
      .filter((r): r is { it: SearchItem; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.it);
  }, [q, items]);

  return (
    <>
      <input
        className={styles.search}
        type="search"
        placeholder="Search for help — e.g. reschedule, login code, courses"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search help articles"
      />
      {q.trim().length > 1 && (
        <div className={styles.results}>
          {results.length === 0 ? (
            <p className={styles.muted}>
              No articles match that yet.{" "}
              <Link href="/help/chat" style={{ color: "var(--gold)" }}>
                Ask Mel instead →
              </Link>
            </p>
          ) : (
            <div className={styles.list}>
              {results.map((r) => (
                <Link key={r.slug} href={`/help/a/${r.slug}`} className={styles.listItem}>
                  <div className={styles.listTitle}>{r.title}</div>
                  <div className={styles.muted}>{r.excerpt}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
