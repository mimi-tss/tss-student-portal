"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FormattedDateTime } from "@/components/formatted-time";
import type { AdminThreadDetail } from "@/lib/support/admin";
import styles from "../../../admin.module.css";

const POLL_MS = 5000;
const SENDER_LABEL: Record<string, string> = {
  student: "Student",
  coach: "Coach",
  guest: "Guest",
  bot: "Mel (AI)",
  admin: "Studio",
  system: "System",
};

export default function SupportThreadClient({ initial }: { initial: AdminThreadDetail }) {
  const [detail, setDetail] = useState(initial);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(initial.messages.length);
  const { thread, messages } = detail;

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/admin/support?id=${thread.id}`, { cache: "no-store" });
      if (res.ok) setDetail(await res.json());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [thread.id]);

  useEffect(() => {
    if (messages.length !== countRef.current && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
    countRef.current = messages.length;
  }, [messages.length]);

  async function act(action: string, body?: string, minutes?: number) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, action, body, minutes }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "That didn't work.");
      return false;
    }
    setDetail(json);
    if (action === "email") setNotice("Transcript emailed to the studio inbox.");
    return true;
  }

  const open = thread.status !== "resolved";

  return (
    <>
      <div className={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 className={styles.pageTitle} style={{ margin: 0 }}>
              {thread.who}
            </h1>
            <div className={styles.mutedText} style={{ fontSize: 13, marginTop: 4 }}>
              {thread.email ? <a href={`mailto:${thread.email}`} style={{ color: "inherit" }}>{thread.email}</a> : "no email"}
              {thread.tier && <> · {thread.tier}</>}
              {thread.isMinor && <> · <span className={styles.badgeWarn}>Under 18</span></>} · started <FormattedDateTime value={thread.createdAt} /> · status:{" "}
              <strong>{thread.status.replace("_", " ")}</strong>
              {thread.studentId && (
                <>
                  {" "}
                  · <Link href={`/admin/students/${thread.studentId}`}>student profile</Link>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            {(thread.status === "needs_human" || thread.status === "bot") && (
              <button type="button" className={styles.ctaSmall} disabled={busy} onClick={() => act("claim")}>
                Claim
              </button>
            )}
            {thread.status === "needs_human" &&
              [3, 5, 8].map((m) => (
                <button key={m} type="button" className={styles.btnGhost} disabled={busy} onClick={() => act("eta", undefined, m)}>
                  Join in {m} min
                </button>
              ))}
            {(thread.status === "claimed" || thread.status === "needs_human") && (
              <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => act("handback")}>
                Hand back to bot
              </button>
            )}
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => act("email")}>
              Email transcript to inbox
            </button>
            {open ? (
              <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => act("resolve")}>
                Resolve
              </button>
            ) : (
              <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => act("reopen")}>
                Reopen
              </button>
            )}
          </div>
        </div>
        {thread.reason && (
          <p style={{ margin: "12px 0 0" }}>
            <strong>Reason:</strong> {thread.reason}
          </p>
        )}
        {thread.summary && (
          <p className={styles.mutedText} style={{ margin: "4px 0 0" }}>
            {thread.summary}
          </p>
        )}
        <p className={styles.mutedText} style={{ fontSize: 12, margin: "8px 0 0" }}>
          {thread.botTurns} bot replies · approx. ${thread.costUsd.toFixed(3)}
          {thread.resolvedBy && <> · closed by {thread.resolvedBy === "auto" ? "no reply (5 min)" : thread.resolvedBy === "student" ? "student (solved)" : "admin"}</>}
          {thread.rating && (
            <>
              {" "}
              · rating <span style={{ color: "var(--gold)" }}>{"★".repeat(thread.rating)}{"☆".repeat(5 - thread.rating)}</span>
            </>
          )}
        </p>
      </div>

      <div ref={listRef} className={styles.panel} style={{ maxHeight: "55vh", overflowY: "auto" }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 14 }}>
            <div className={styles.mutedText} style={{ fontSize: 12 }}>
              <strong>{m.sender === "student" || m.sender === "coach" || m.sender === "guest" ? thread.who : SENDER_LABEL[m.sender]}</strong> ·{" "}
              <FormattedDateTime value={m.createdAt} />
            </div>
            {m.body && (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  lineHeight: 1.5,
                  fontStyle: m.sender === "system" ? "italic" : undefined,
                  opacity: m.sender === "system" ? 0.75 : 1,
                }}
              >
                {m.body}
              </div>
            )}
            {m.action && (
              <div className={styles.mutedText} style={{ fontSize: 13 }}>
                Proposed: {m.action.label} — <strong>{m.action.status}</strong>
                {m.action.result && m.action.result !== "running" ? ` (${m.action.result})` : ""}
              </div>
            )}
            {m.attachmentUrl && (
              <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.attachmentUrl}
                  alt="Attachment"
                  style={{ maxWidth: 260, maxHeight: 180, borderRadius: 8, marginTop: 6, border: "1px solid var(--border)" }}
                />
              </a>
            )}
          </div>
        ))}
      </div>

      <div className={styles.panel}>
        {error && <p className={styles.errorText}>{error}</p>}
        {notice && <p className={styles.successText}>{notice}</p>}
        <textarea
          className={styles.input}
          rows={3}
          style={{ width: "100%", resize: "vertical" }}
          placeholder={thread.status === "claimed" ? "Reply to the student…" : "Replying claims this chat (the bot goes quiet)…"}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim() && !busy) {
              if (await act("reply", reply)) setReply("");
            }
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span className={styles.mutedText} style={{ fontSize: 12 }}>
            The student sees replies live on the help page. If they&apos;ve left, use “Email transcript” and reply by email.
          </span>
          <button
            type="button"
            className={styles.cta}
            disabled={busy || !reply.trim()}
            onClick={async () => {
              if (await act("reply", reply)) setReply("");
            }}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}
