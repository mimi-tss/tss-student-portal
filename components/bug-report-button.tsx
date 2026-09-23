"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, ImagePlus, X } from "lucide-react";
import tokens from "@/app/theme-tokens.module.css";
import styles from "./bug-report-button.module.css";

const MAX_SCREENSHOTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;

type Shot = { file: File; url: string };

// "Beta · Found a bug? Report" — lives in the student + coach headers.
// Opens a modal (email, what went wrong, up to 3 screenshots via picker,
// drag-drop, or paste) that posts to /api/bug-reports; admin reviews
// them at /admin/bug-reports.
//
// The modal is portaled to <body> because both headers are sticky with
// backdrop-filter, which makes them the containing block for any
// position:fixed descendant — rendered in place, the overlay would be
// clipped to the header strip. Portaling out loses the route group's
// .root tokens, so the overlay re-applies the shared tokens class itself.
export default function BugReportButton({ defaultEmail }: { defaultEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: File[]) {
    setError(null);
    const images = files.filter((f) => f.type.startsWith("image/"));
    const tooBig = images.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`${tooBig.name || "That image"} is over 5 MB.`);
      return;
    }
    setShots((prev) => {
      const room = MAX_SCREENSHOTS - prev.length;
      if (images.length > room) setError(`Up to ${MAX_SCREENSHOTS} screenshots.`);
      return [...prev, ...images.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  }

  function removeShot(i: number) {
    setShots((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  }

  function close() {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setOpen(false);
    setMessage("");
    setShots([]);
    setError(null);
    setSent(false);
  }

  // Esc closes; Cmd/Ctrl+V anywhere in the open modal attaches a pasted
  // screenshot (macOS Cmd+Shift+Ctrl+4 copies straight to clipboard).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) close();
    }
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sending, shots]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const body = new FormData();
    body.set("email", email);
    body.set("message", message);
    body.set("pageUrl", window.location.href);
    shots.forEach((s) => body.append("screenshots", s.file));
    try {
      const res = await fetch("/api/bug-reports", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't send your report. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your report. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const canSend = email.trim() !== "" && message.trim() !== "" && !sending;

  return (
    <>
      <div className={styles.pill}>
        <Bug size={16} className={styles.pillIcon} aria-hidden />
        <span className={styles.pillText}>
          Beta · <span className={styles.pillMuted}>Found a bug?</span>
        </span>
        <button type="button" className={styles.pillButton} onClick={() => setOpen(true)}>
          Report
        </button>
      </div>

      {open &&
        createPortal(
          <div
            className={`${tokens.tokens} ${styles.overlay}`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !sending) close();
            }}
          >
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
              <div className={styles.modalHead}>
                <h2 id="bug-report-title" className={styles.title}>
                  Report an Issue
                </h2>
                <button type="button" className={styles.closeBtn} onClick={close} aria-label="Close" disabled={sending}>
                  <X size={20} />
                </button>
              </div>

              {sent ? (
                <div className={styles.body}>
                  <p className={styles.thanks}>Thanks! Your report was sent. We&apos;ll look into it and reach out if we need more details.</p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.primaryBtn} onClick={close}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form className={styles.body} onSubmit={submit}>
                  <label className={styles.label}>
                    Your email
                    <input
                      type="email"
                      className={styles.input}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>

                  <label className={styles.label}>
                    What went wrong?
                    <textarea
                      className={styles.textarea}
                      placeholder="What were you trying to do, and what happened instead?"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      maxLength={5000}
                      required
                      autoFocus
                    />
                  </label>

                  <div className={styles.label}>
                    <span>
                      Screenshots <span className={styles.optional}>(optional, up to {MAX_SCREENSHOTS})</span>
                    </span>
                    {shots.length > 0 && (
                      <div className={styles.thumbs}>
                        {shots.map((s, i) => (
                          <div key={s.url} className={styles.thumb}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.url} alt={`Screenshot ${i + 1}`} />
                            <button
                              type="button"
                              className={styles.thumbRemove}
                              onClick={() => removeShot(i)}
                              aria-label={`Remove screenshot ${i + 1}`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {shots.length < MAX_SCREENSHOTS && (
                      <button
                        type="button"
                        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ""}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          addFiles(Array.from(e.dataTransfer.files));
                        }}
                      >
                        <ImagePlus size={18} aria-hidden />
                        <span>Click to add, drag an image here, or paste (⌘V / Ctrl+V)</span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/heic"
                      multiple
                      hidden
                      onChange={(e) => {
                        addFiles(Array.from(e.target.files ?? []));
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <p className={styles.note}>
                    Thank you for helping us improve the app. We&apos;ll use this to investigate and may reach out if we
                    need more details.
                  </p>

                  {error && <p className={styles.error}>{error}</p>}

                  <div className={styles.actions}>
                    <button type="button" className={styles.secondaryBtn} onClick={close} disabled={sending}>
                      Cancel
                    </button>
                    <button type="submit" className={styles.primaryBtn} disabled={!canSend}>
                      {sending ? "Sending…" : "Send report"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
