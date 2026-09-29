"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./center.module.css";

// "Was this helpful?" — counts go to the article (shown to admin in the
// help-article editor). One vote per browser per article.
export default function ArticleFeedback({ slug }: { slug: string }) {
  const key = `tss_help_vote_${slug}`;
  const [vote, setVote] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "yes" || v === "no") setVote(v);
    } catch {
      // storage blocked — just allow voting
    }
  }, [key]);

  async function send(v: "yes" | "no") {
    setVote(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      // ignore
    }
    await fetch("/api/help/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, helpful: v === "yes" }),
    }).catch(() => {});
  }

  return (
    <div className={styles.panel}>
      {vote === null ? (
        <>
          <strong>Was this helpful?</strong>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={() => send("yes")}>
              👍 Yes
            </button>
            <button type="button" className={styles.btn} onClick={() => send("no")}>
              👎 No
            </button>
          </div>
        </>
      ) : vote === "yes" ? (
        <strong>Thanks for letting us know!</strong>
      ) : (
        <>
          <strong>Sorry about that.</strong>
          <p className={styles.muted} style={{ margin: "4px 0 0" }}>
            <Link href="/help/chat" style={{ color: "var(--gold)" }}>
              Ask Mel
            </Link>{" "}
            — the studio&apos;s AI assistant can help with your exact situation.
          </p>
        </>
      )}
    </div>
  );
}
