"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormattedDateTime } from "./formatted-time";

interface Message {
  id: string;
  sender_profile_id: string;
  body: string | null;
  attachment_url: string | null;
  created_at: string;
}

const POLL_MS = 4000;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

function filenameFromPath(path: string) {
  const withoutFolder = path.split("/").pop() ?? path;
  // Path convention is "{uuid}-{original filename}" — drop the uuid prefix
  // for display.
  const dashIndex = withoutFolder.indexOf("-");
  return dashIndex >= 0 ? withoutFolder.slice(dashIndex + 1) : withoutFolder;
}

function isImage(path: string) {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function ChatPanel({
  studentId,
  currentProfileId,
  dark = false,
}: {
  studentId: string;
  currentProfileId: string;
  // Light-on-dark palette for the student layout's theme (section 8) —
  // admin/coach chat stays on the default light styling.
  dark?: boolean;
}) {
  const supabase = createClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadMessages() {
    const res = await fetch(`/api/chat/messages?studentId=${studentId}`);
    if (!res.ok) return;
    const data = await res.json();
    setThreadId(data.threadId);
    setParticipants(data.participants ?? {});
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Confined to the message list's own scroll container — a poll that
  // finds no new messages (most of them, at 4s intervals) must not touch
  // scroll at all, and even a real new message should only move this
  // panel, never the page it's embedded in.
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  // Signed URLs (bucket is private) — generate once per attachment path,
  // cached so we're not re-signing on every poll.
  useEffect(() => {
    const missing = messages
      .map((m) => m.attachment_url)
      .filter((path): path is string => !!path && !signedUrls[path]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map(async (path) => {
        const { data } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrl(path, 3600);
        return [path, data?.signedUrl ?? null] as const;
      }),
    ).then((entries) => {
      setSignedUrls((prev) => ({
        ...prev,
        ...Object.fromEntries(
          entries.filter((e): e is [string, string] => e[1] !== null),
        ),
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function handleSend() {
    if (!text.trim() && !file) return;
    if (!threadId) return;

    setSending(true);
    setError(null);

    try {
      let attachmentUrl: string | null = null;

      if (file) {
        const path = `${threadId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(path, file);
        if (uploadError) {
          setError(uploadError.message);
          setSending(false);
          return;
        }
        attachmentUrl = path;
      }

      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, body: text.trim() || null, attachmentUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not send that message.");
        setSending(false);
        return;
      }

      setText("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMessages();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={
        dark
          ? "flex h-[70vh] flex-col rounded-2xl border border-[#2c2c3d] bg-[#1a1a26]"
          : "flex h-[70vh] flex-col rounded border"
      }
    >
      <div ref={messagesContainerRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className={dark ? "text-sm text-[#9997ab]" : "text-sm text-gray-500"}>
            No messages yet — say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_profile_id === currentProfileId;
          const senderName = participants[m.sender_profile_id] ?? "Unknown";
          const attachmentUrl = m.attachment_url ? signedUrls[m.attachment_url] : null;

          const bubbleClass = dark
            ? mine
              ? "max-w-xs rounded-xl rounded-br-sm p-2.5 text-sm bg-[#a78bfa] text-[#241a3d]"
              : "max-w-xs rounded-xl rounded-bl-sm p-2.5 text-sm bg-[#20202f] text-[#f4f0e6] border border-[#2c2c3d]"
            : mine
              ? "max-w-xs rounded p-2 text-sm bg-black text-white"
              : "max-w-xs rounded p-2 text-sm bg-gray-100 text-gray-900";

          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={bubbleClass}>
                {!mine && <p className="mb-0.5 text-xs font-medium opacity-70">{senderName}</p>}
                {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                {m.attachment_url && (
                  <div className="mt-1">
                    {attachmentUrl && isImage(m.attachment_url) ? (
                      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={attachmentUrl}
                          alt={filenameFromPath(m.attachment_url)}
                          className="max-h-40 rounded"
                        />
                      </a>
                    ) : (
                      <a
                        href={attachmentUrl ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`underline ${mine ? (dark ? "text-[#241a3d]" : "text-white") : dark ? "text-[#a78bfa]" : "text-blue-600"}`}
                      >
                        {filenameFromPath(m.attachment_url)}
                      </a>
                    )}
                  </div>
                )}
                <p
                  className={`mt-1 text-[10px] ${mine ? "opacity-70" : dark ? "text-[#9997ab]" : "text-gray-400"}`}
                >
                  <FormattedDateTime value={m.created_at} />
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={dark ? "border-t border-[#2c2c3d] bg-[#20202f] p-3" : "border-t p-3"}
      >
        {error && (
          <p className={dark ? "mb-2 text-sm text-[#e85c86]" : "mb-2 text-sm text-red-600"}>
            {error}
          </p>
        )}
        {file && (
          <p className={dark ? "mb-2 text-xs text-[#9997ab]" : "mb-2 text-xs text-gray-600"}>
            Attached: {file.name}{" "}
            <button onClick={() => setFile(null)} className="underline">
              remove
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message…"
            rows={2}
            className={
              dark
                ? "flex-1 resize-none rounded-lg border border-[#2c2c3d] bg-[#1a1a26] p-2 text-sm text-[#f4f0e6] placeholder:text-[#9997ab]"
                : "flex-1 resize-none rounded border p-2 text-sm"
            }
          />
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="chat-file-input"
          />
          <label
            htmlFor="chat-file-input"
            className={
              dark
                ? "cursor-pointer rounded-lg border border-[#2c2c3d] bg-[#1a1a26] px-3 py-2 text-sm text-[#9997ab] hover:text-[#f4f0e6]"
                : "cursor-pointer rounded border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            }
          >
            Attach
          </label>
          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && !file)}
            className={
              dark
                ? "rounded-lg bg-[#a78bfa] px-4 py-2 text-sm font-bold text-[#241a3d] disabled:opacity-50"
                : "rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            }
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
