"use client";

import { useRef, useState } from "react";

interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string | null;
  isShortcut?: boolean;
}

type PendingAction = null | "link";

// Shared folder (coach dashboard spec) — student, coach, and admin can
// all upload, add a shortcut via a pasted Drive link, or remove an item,
// all against the same per-student Drive folder recordings already live
// in. Uses Tailwind arbitrary var() classes rather than a CSS module so
// it renders correctly under any of the three route groups' theme root
// (same cross-route-group approach as components/coach-calendar.tsx) —
// never allows downloading in the sense that no filename/direct-file-URL
// download link is exposed by this UI; Drive's own copy/download
// affordances are additionally disabled server-side on upload/shortcut
// creation (copyRequiresWriterPermission), best-effort not airtight.
export default function SharedFolderPanel({
  studentId,
  initialFiles,
}: {
  studentId: string;
  initialFiles: DriveFile[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [driveLink, setDriveLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshAfter(action: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    const res = await refreshAfterInner(action);
    setBusy(false);
    return res;
  }

  async function refreshAfterInner(action: () => Promise<Response>) {
    const res = await action();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return res;
    }
    const body = await res.json();
    if (body.file) setFiles((prev) => [body.file, ...prev]);
    return res;
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("studentId", studentId);
    await refreshAfter(() => fetch("/api/shared-folder/upload", { method: "POST", body: formData }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAddLink() {
    if (!driveLink.trim()) return;
    const res = await refreshAfter(() =>
      fetch("/api/shared-folder/shortcut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, driveLink: driveLink.trim() }),
      }),
    );
    if (res.ok) {
      setDriveLink("");
      setPending(null);
    }
  }

  async function handleRemove(fileId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/shared-folder/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, fileId }),
    });
    setBusy(false);
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't remove that item.");
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <span>📁</span>
          <span>Shared Folder — Coach, Student &amp; Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPending(pending === "link" ? null : "link")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]"
          >
            🔗 Add shortcut
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-[var(--gold-text)] disabled:opacity-50"
          >
            ⬆ Upload
          </button>
          <input ref={fileInputRef} type="file" onChange={handleUpload} disabled={busy} className="hidden" />
        </div>
      </div>

      {pending === "link" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3">
          <input
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            placeholder="Paste a Google Drive link…"
            className="flex-1 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
          />
          <button
            onClick={handleAddLink}
            disabled={busy || !driveLink.trim()}
            className="rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-bold text-[var(--gold-text)] disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {error && <p className="px-5 pt-2 text-xs text-[var(--coral)]">{error}</p>}

      {files.length === 0 ? (
        <p className="p-5 text-sm text-[var(--text-muted)]">Nothing shared yet.</p>
      ) : (
        <div className="p-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-[var(--surface-2)]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-sm">
                {f.isShortcut ? "🔗" : "🎵"}
              </div>
              <a
                href={f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]"
              >
                {f.name}
              </a>
              <button
                onClick={() => handleRemove(f.id)}
                disabled={busy}
                className="shrink-0 text-xs text-[var(--text-muted)] disabled:opacity-50"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-[var(--border)] px-5 py-3 text-[11px] text-[var(--text-muted)]">
        Coach, student, and admin can all upload files or add shortcuts here. Files can be viewed or removed —
        never downloaded.
      </div>
    </div>
  );
}
