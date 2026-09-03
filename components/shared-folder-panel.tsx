"use client";

import { useEffect, useRef, useState } from "react";

interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string | null;
  isShortcut?: boolean;
}

type PendingAction = null | "link";

// PUTs the file's bytes straight to the Drive resumable-upload session
// URL minted by /api/shared-folder/upload-session — never touches this
// app's own server. XMLHttpRequest rather than fetch specifically for
// upload.onprogress: fetch has no built-in upload-progress event, and a
// several-hundred-MB video with no progress feedback at all would just
// look hung.
//
// Confirmed live: Drive's resumable-upload endpoint will accept and
// complete a cross-origin PUT from the browser, but doesn't reliably let
// browser JS actually READ that response back (a CORS quirk on the
// response itself, not the request) — this fires `onerror` with no
// readable status at all even when the file already exists in Drive.
// So this function's rejection means "the browser couldn't confirm it,"
// NOT "it definitely failed" — the caller re-checks Drive's own folder
// listing (via this app's server, unaffected by browser CORS) rather
// than trusting this promise's outcome as the final word.
function putFileDirectly(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network error (possibly just an unreadable response — verifying)"));
    xhr.send(file);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
//
// Fetches its own file list on mount rather than taking it as a server
// prop — this used to be `initialFiles`, computed server-side via
// listStudentRecordings (a live Drive API call, the slowest thing this
// app does) on every page that renders this panel. That meant every
// unrelated action on those pages (Cancel, Add credit, assign an
// exercise, switching which student a coach has selected, ...) paid for
// a Drive round-trip it didn't need, every time it triggered a
// server-side refresh/refetch. Self-fetching here means only this panel
// pays that cost, once, on its own.
export default function SharedFolderPanel({ studentId }: { studentId: string }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [driveLink, setDriveLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/shared-folder/list?studentId=${studentId}`)
      .then((res) => res.json())
      .then((data) => setFiles(data.files ?? []))
      .catch(() => setError("Couldn't load the shared folder."))
      .finally(() => setLoading(false));
  }, [studentId]);

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

  // Two steps: ask this app for a Drive upload session (fast, no file
  // bytes involved), then PUT the file straight to Google from the
  // browser — no size cap, since the file never passes through our own
  // server at all (see lib/google/drive.ts's createResumableUploadSession
  // for why the old buffered route couldn't handle a real video).
  //
  // The PUT's own success/failure signal isn't trusted on its own —
  // confirmed live that Drive can genuinely receive and create the file
  // while the browser still reports a network error reading the response
  // back (see putFileDirectly's comment). So either way, this re-checks
  // Drive's own folder listing through our server (server-side, immune to
  // the browser's CORS restriction) to find out what actually happened —
  // one retry after a short pause in case Drive's listing lags the write
  // by a moment.
  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setUploadProgress(0);
    const knownIds = new Set(files.map((f) => f.id));
    let putError: string | null = null;
    try {
      const sessionRes = await fetch("/api/shared-folder/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, fileName: file.name, mimeType: file.type || "application/octet-stream" }),
      });
      if (!sessionRes.ok) {
        const body = await sessionRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not start the upload.");
      }
      const { uploadUrl } = await sessionRes.json();

      try {
        await putFileDirectly(uploadUrl, file, setUploadProgress);
      } catch (err) {
        putError = err instanceof Error ? err.message : "upload error";
      }

      setUploadProgress(null);
      let landedFile: DriveFile | undefined;
      for (const delayMs of [0, 2000]) {
        if (delayMs) await sleep(delayMs);
        const listRes = await fetch(`/api/shared-folder/list?studentId=${studentId}`);
        if (!listRes.ok) continue;
        const { files: freshFiles } = (await listRes.json()) as { files: DriveFile[] };
        landedFile = freshFiles.find((f) => !knownIds.has(f.id) && f.name === file.name);
        if (landedFile) {
          setFiles(freshFiles);
          break;
        }
      }
      if (!landedFile) {
        throw new Error(
          putError ? `Upload didn't complete (${putError}) — please try again.` : "Upload didn't complete — please try again.",
        );
      }

      // Coach-facing Slack ping — only actually sends when the caller
      // resolves server-side to being this student themselves (see the
      // route's own comment); fire-and-forget, a notification hiccup
      // shouldn't make a successful upload look like it failed.
      fetch("/api/shared-folder/notify-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, fileId: landedFile.id, fileName: file.name }),
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
            {uploadProgress !== null ? `⬆ Uploading… ${uploadProgress}%` : "⬆ Upload"}
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

      {loading ? (
        <p className="p-5 text-sm text-[var(--text-muted)]">Loading…</p>
      ) : files.length === 0 ? (
        <p className="p-5 text-sm text-[var(--text-muted)]">Nothing shared yet.</p>
      ) : (
        <div className="max-h-[270px] overflow-y-auto p-2">
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
