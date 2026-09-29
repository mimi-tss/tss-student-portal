"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { HelpView } from "@/lib/support/view";
import styles from "./help.module.css";

const POLL_MS = 4000;
const TOKEN_KEY = "tss_support_guest";
const SUGGESTIONS = [
  "I can't log in",
  "I need to reschedule a lesson",
  "Where are my courses?",
  "How do I change my notifications?",
];

// localStorage can throw (private mode, blocked storage) — the httpOnly
// cookie still works in that case; this header copy is only the
// fallback for Safari inside the Kajabi iframe, where cookies drop.
function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}
function guestHeaders(): Record<string, string> {
  const t = readToken();
  return t ? { "x-support-guest": t } : {};
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

function linkify(text: string): ReactNode[] {
  return text.split(/((?:https?:\/\/)[^\s<>"]+)/gi).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part.replace(/[.,!?;:)]+$/, "")} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// Name first, then email — one simple question at a time for students who
// aren't comfortable with tech. Used both inside Mel's "so the team can reach you"
// card and behind the "Talk to someone" link.
function ContactSteps({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (contact: { guestName: string; guestEmail: string }) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<"name" | "email">("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <form
      className={styles.contactForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "name") {
          if (name.trim()) setStep("email");
        } else if (emailOk) {
          onSubmit({ guestName: name.trim(), guestEmail: email.trim() });
        }
      }}
    >
      {step === "name" ? (
        <>
          <label className={styles.actionLabel} htmlFor="contact-name">
            Step 1 of 2: What&apos;s your name?
          </label>
          <input
            id="contact-name"
            className={styles.input}
            autoFocus
            autoComplete="name"
            placeholder="Your first and last name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className={styles.bannerRow}>
            <button type="submit" className={styles.btnPrimary} disabled={!name.trim()}>
              Next
            </button>
            {onCancel && (
              <button type="button" className={styles.btn} onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <label className={styles.actionLabel} htmlFor="contact-email">
            Step 2 of 2: What email did you sign up with?
          </label>
          <input
            id="contact-email"
            className={styles.input}
            type="email"
            inputMode="email"
            autoFocus
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className={styles.bannerRow}>
            <button type="submit" className={styles.btnPrimary} disabled={busy || !emailOk}>
              Send to the team
            </button>
            <button type="button" className={styles.btn} onClick={() => setStep("name")}>
              Back
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export default function HelpChat() {
  const [view, setView] = useState<HelpView | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askContact, setAskContact] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const lastCountRef = useRef(0);

  const apply = useCallback(async (res: Response) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (json.error === "needs_contact") {
        setAskContact(true);
        return false;
      }
      setError(json.error ?? "Something went wrong. Please try again.");
      return false;
    }
    if (json.guestToken) saveToken(json.guestToken);
    setView(json as HelpView);
    return true;
  }, []);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    const res = await fetch("/api/support/thread", { headers: guestHeaders(), cache: "no-store" });
    if (res.ok && !busyRef.current) await apply(res);
  }, [apply]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const count = (view?.messages.length ?? 0) + (busy ? 1 : 0);
    if (count !== lastCountRef.current && listRef.current) {
      // After paint, so a new form/card's height is already counted; a
      // smooth scroll got cut short when content grew mid-animation.
      const el = listRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    lastCountRef.current = count;
  }, [view, busy]);

  async function run(fn: () => Promise<Response>) {
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      return await apply(await fn());
    } catch {
      setError("Couldn't reach the studio. Check your connection and try again.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function send(message?: string) {
    const body = (message ?? text).trim();
    if (!body && !file) return;
    const form = new FormData();
    form.set("body", body);
    form.set("tz", browserTimeZone());
    if (file) form.set("file", file);

    // Show the student's own line right away while the bot thinks.
    setView((v) =>
      v
        ? {
            ...v,
            messages: [
              ...v.messages,
              {
                id: `local-${Date.now()}`,
                sender: v.caller.kind === "student" ? "student" : "guest",
                body: body || null,
                attachmentUrl: null,
                attachmentName: file?.name ?? null,
                action: null,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : v,
    );
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";

    await run(() => fetch("/api/support/messages", { method: "POST", headers: guestHeaders(), body: form }));
  }

  async function talkToPerson(contact?: { guestName: string; guestEmail: string; contactRequestId?: string }) {
    const ok = await run(() =>
      fetch("/api/support/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...guestHeaders() },
        body: JSON.stringify(contact ?? {}),
      }),
    );
    if (ok) setAskContact(false);
  }

  async function emailInstead() {
    await run(() => fetch("/api/support/email-transcript", { method: "POST", headers: guestHeaders() }));
  }

  async function decide(messageId: string, decision: "confirm" | "decline") {
    await run(() =>
      fetch("/api/support/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, decision }),
      }),
    );
  }

  const thread = view?.thread ?? null;
  const status = thread?.status;
  const isStudent = view?.caller.kind === "student";
  const noMessagesYet = !view || view.messages.length === 0;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <img src="/logo.png" alt="" className={styles.logo} />
        <h1 className={styles.title}>Help</h1>
        {isStudent ? (
          <a href="/student/dashboard" className={styles.headerLink}>
            Back to portal
          </a>
        ) : (
          <a href="/login" className={styles.headerLink}>
            Log in
          </a>
        )}
      </header>

      {status === "needs_human" && view && (
        <div className={styles.banner}>
          {view.inOfficeHours ? (
            <>
              {thread?.etaMinutes ? (
                <>
                  <strong>A team member has seen your message</strong> and will join in about {thread.etaMinutes}{" "}
                  {thread.etaMinutes === 1 ? "minute" : "minutes"}.
                </>
              ) : (
                <>
                  <strong>You&apos;re #{thread?.queuePosition ?? 1} in line.</strong> A team member usually joins within
                  about {view.expectedWaitMinutes} minutes.
                </>
              )}
              <div className={styles.bannerRow}>
                <button type="button" className={styles.btn} disabled={busy} onClick={emailInstead}>
                  Can&apos;t wait ~{thread?.etaMinutes ?? view.expectedWaitMinutes} min? Email us instead
                </button>
              </div>
            </>
          ) : (
            <>Waiting for the team — they&apos;re available {view.officeHours}.</>
          )}
        </div>
      )}
      {status === "claimed" && <div className={styles.banner}>A team member has joined the chat.</div>}
      {thread?.closed && (
        <div className={styles.banner}>
          {status === "emailed"
            ? `This conversation was sent to ${view?.supportEmail}. The team will reply by email.`
            : "This conversation is closed."}{" "}
          Send a new message any time to start a new chat.
        </div>
      )}

      <div ref={listRef} className={styles.messages}>
        <div className={styles.row}>
          <div className={`${styles.bubble} ${styles.bubbleTheirs}`}>
            <div className={styles.sender}>Mel · AI assistant</div>
            {view?.caller.email ? (
              <>
                Hi, you&apos;re signed in as <strong>{view.caller.email}</strong>
              </>
            ) : (
              <>Hi! I&apos;m Mel, the studio&apos;s AI assistant.</>
            )}
            {"\n\n"}
            <strong>What can I help you with?</strong> Share as many details as you can.
          </div>
        </div>

        {noMessagesYet && (
          <div className={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className={styles.btn} disabled={busy} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {view?.messages.map((m) => {
          if (m.sender === "system") {
            return (
              <p key={m.id} className={styles.system}>
                {m.body}
              </p>
            );
          }
          const mine = m.sender === "student" || m.sender === "guest";
          return (
            <div key={m.id} className={`${styles.row} ${mine ? styles.rowMine : ""}`}>
              <div className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                {!mine && <div className={styles.sender}>{m.sender === "admin" ? "Studio team (a person)" : "Mel · AI assistant"}</div>}
                {m.body && linkify(m.body)}
                {m.attachmentUrl &&
                  (/\.pdf$/i.test(m.attachmentName ?? "") ? (
                    <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className={styles.attachment}>
                      Attached PDF
                    </a>
                  ) : (
                    <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer">
                      <img src={m.attachmentUrl} alt="Attachment" className={styles.attachment} />
                    </a>
                  ))}
                {!m.attachmentUrl && m.attachmentName && <div className={styles.small}>Attached: {m.attachmentName}</div>}
                {m.action && (
                  <div className={styles.actionCard}>
                    <div className={styles.actionLabel}>{m.action.label}</div>
                    {m.action.kind === "contact_request" ? (
                      m.action.status === "pending" && !isStudent && !thread?.closed ? (
                        <ContactSteps busy={busy} onSubmit={(c) => talkToPerson({ ...c, contactRequestId: m.id })} />
                      ) : (
                        <div className={styles.actionStatus}>{m.action.status === "done" ? "Sent to the team" : "Closed"}</div>
                      )
                    ) : m.action.status === "pending" && isStudent && !thread?.closed ? (
                      <div className={styles.bannerRow}>
                        <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => decide(m.id, "confirm")}>
                          Confirm
                        </button>
                        <button type="button" className={styles.btn} disabled={busy} onClick={() => decide(m.id, "decline")}>
                          Not now
                        </button>
                      </div>
                    ) : (
                      <div className={styles.actionStatus}>
                        {m.action.status === "done"
                          ? "Done"
                          : m.action.status === "declined"
                            ? "Not done"
                            : m.action.status === "failed" && m.action.result !== "running"
                              ? `Didn't go through: ${m.action.result ?? ""}`
                              : m.action.status === "pending"
                                ? "Closed"
                                : "Working…"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {!busy && view && view.suggestions.length > 0 && (
          <div className={styles.suggestions}>
            {view.suggestions.map((s) => (
              <button key={s} type="button" className={styles.btn} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {busy && <p className={styles.typing}>…</p>}
      </div>

      <div className={styles.composer}>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.small} style={{ marginTop: 0, marginBottom: 6 }}>
          Mel is an AI assistant — chats are saved and may be read by the studio team. Never share passwords or payment details.
        </p>

        {askContact ? (
          <ContactSteps busy={busy} onSubmit={(c) => talkToPerson(c)} onCancel={() => setAskContact(false)} />
        ) : (
          <>
            {file && (
              <p className={styles.small} style={{ marginTop: 0, marginBottom: 6 }}>
                Attached: {file.name}{" "}
                <button type="button" className={styles.headerLink} style={{ background: "none", border: 0 }} onClick={() => setFile(null)}>
                  remove
                </button>
              </p>
            )}
            <div className={styles.composerRow}>
              <textarea
                className={styles.textarea}
                rows={2}
                value={text}
                placeholder="Type your question…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy) send();
                  }
                }}
              />
              <input
                ref={fileRef}
                id="help-file"
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="help-file" className={styles.btn} title="Attach a screenshot">
                📎
              </label>
              <button type="button" className={styles.btnPrimary} disabled={busy || (!text.trim() && !file)} onClick={() => send()}>
                Send
              </button>
            </div>
            {thread?.canAskForHuman && (
              <p className={styles.small}>
                Still stuck?{" "}
                <button
                  type="button"
                  className={styles.headerLink}
                  style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                  disabled={busy}
                  onClick={() => talkToPerson()}
                >
                  Talk to someone from the studio
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
