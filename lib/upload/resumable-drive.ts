"use client";

// Sends the file's bytes straight to the Drive resumable-upload session
// URL minted by /api/shared-folder/upload-session — never through this
// app's own server — in CHUNK_BYTES pieces (Drive's resumable protocol:
// each PUT carries a Content-Range; Drive answers 308 + the Range it has
// so far, then 200/201 with the file once complete). A dropped connection
// or a paused tab (iPad screen dimming, the Kajabi app backgrounding)
// only costs the current piece: on any failure it asks Drive how much it
// already has ("bytes */size") and carries on from there, with backoff.
// Used to be one PUT of the whole file — an iPad video of a few hundred
// MB failed outright on any hiccup, after minutes of uploading, with
// nothing to resume (Maryke Meyer's report, 2026-10-02).
//
// Readable replies depend on the session being created with this page's
// Origin (lib/google/drive.ts createResumableUploadSession); without it
// every reply reads as status 0. Resolves the new file's id, or null if
// Drive's answer couldn't be read/confirmed — the caller then re-checks
// the folder listing server-side before calling it a failure.
const CHUNK_BYTES = 8 * 1024 * 1024; // must be a multiple of 256 KiB
const MAX_CONSECUTIVE_FAILURES = 6;

type ChunkReply = { status: number; range: string | null; fileId: string | null };

function putChunk(url: string, body: Blob | null, contentRange: string | null, onLoaded?: (bytes: number) => void): Promise<ChunkReply> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentRange) xhr.setRequestHeader("Content-Range", contentRange);
    if (onLoaded) xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      let fileId: string | null = null;
      try {
        fileId = (JSON.parse(xhr.responseText) as { id?: string }).id ?? null;
      } catch {
        // 308s have no body
      }
      resolve({ status: xhr.status, range: xhr.getResponseHeader("Range"), fileId });
    };
    xhr.onerror = () => resolve({ status: 0, range: null, fileId: null });
    xhr.send(body);
  });
}

function nextOffset(range: string | null): number {
  // "bytes=0-8388607" → 8388608; no Range header = Drive has nothing yet.
  const last = range?.match(/-(\d+)$/)?.[1];
  return last ? Number(last) + 1 : 0;
}

export async function uploadResumable(url: string, file: File, onProgress: (percent: number) => void): Promise<string | null> {
  let offset = 0;
  let failures = 0;
  const report = (sent: number) => onProgress(file.size ? Math.min(99, Math.round((sent / file.size) * 100)) : 99);
  while (true) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    const reply =
      file.size === 0
        ? await putChunk(url, file, null)
        : await putChunk(url, file.slice(offset, end), `bytes ${offset}-${end - 1}/${file.size}`, (b) => report(offset + b));
    if (reply.status === 200 || reply.status === 201) return reply.fileId ?? "";
    if (reply.status === 308) {
      offset = nextOffset(reply.range);
      failures = 0;
      report(offset);
      continue;
    }
    if (reply.status === 404 || reply.status === 410) throw new Error("The upload expired — please try again.");
    if (reply.status >= 400 && reply.status < 500) throw new Error(`Google Drive refused the upload (${reply.status}).`);

    // Network drop, paused tab, or a 5xx: wait, then ask Drive where it got to.
    failures++;
    if (failures > MAX_CONSECUTIVE_FAILURES) return null;
    await sleep(Math.min(2000 * 2 ** (failures - 1), 30_000));
    const status = await putChunk(url, null, `bytes */${file.size}`);
    if (status.status === 200 || status.status === 201) return status.fileId ?? "";
    if (status.status === 308) offset = nextOffset(status.range);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Full shared-folder upload for one file: asks this app for a Drive
// session for the student's shared folder, then uploadResumable. Throws
// with a readable message on failure; resolves the Drive file id (""
// when Drive confirmed but the id couldn't be read).
export async function uploadToSharedFolder(
  studentId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
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
  const fileId = await uploadResumable(uploadUrl, file, onProgress);
  if (fileId === null) throw new Error("Upload didn't complete (the connection kept dropping) — please try again.");
  return fileId;
}
