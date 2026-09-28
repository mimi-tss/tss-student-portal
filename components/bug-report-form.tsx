"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import styles from "./bug-report-button.module.css";

const MAX_SCREENSHOTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;

type Shot = { file: File; url: string };

// The "Report an Issue" form body — email, what went wrong, up to 3
// screenshots (picker, drag-drop, or paste). Shared by the header
// button's modal (components/bug-report-button.tsx) and the public,
// shareable /report-bug page. Posts to /api/bug-reports.
export default function BugReportForm({
  defaultEmail,
  onCancel,
  onDone,
}: {
  defaultEmail: string;
  onCancel?: () => void;
  onDone?: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Honeypot — hidden from people, filled in by form-spamming bots. The
  // public page accepts logged-out reports, so the API drops any
  // submission that has this set.
  const [website, setWebsite] = useState("");

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

  // Release preview URLs when the form goes away (modal closed).
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  // Cmd/Ctrl+V anywhere on the page attaches a pasted screenshot (macOS
  // Cmd+Shift+Ctrl+4 copies straight to clipboard). Only listens while
  // this form is mounted.
  useEffect(() => {
    if (sent) return;
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [sent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const body = new FormData();
    body.set("email", email);
    body.set("message", message);
    body.set("pageUrl", document.referrer && !document.referrer.includes("/report-bug") ? document.referrer : window.location.href);
    body.set("website", website);
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

  function reset() {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setMessage("");
    setShots([]);
    setError(null);
    setSent(false);
  }

  if (sent) {
    return (
      <div className={styles.body}>
        <p className={styles.thanks}>
          Thanks! Your report was sent. We&apos;ll look into it and reach out if we need more details.
        </p>
        <div className={styles.actions}>
          {onDone ? (
            <button type="button" className={styles.primaryBtn} onClick={onDone}>
              Done
            </button>
          ) : (
            <button type="button" className={styles.secondaryBtn} onClick={reset}>
              Report something else
            </button>
          )}
        </div>
      </div>
    );
  }

  const canSend = email.trim() !== "" && message.trim() !== "" && !sending;

  return (
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

      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className={styles.honeypot}
      />

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
        Thank you for helping us improve the app. We&apos;ll use this to investigate and may reach out if we need
        more details.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={sending}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.primaryBtn} disabled={!canSend}>
          {sending ? "Sending…" : "Send report"}
        </button>
      </div>
    </form>
  );
}
