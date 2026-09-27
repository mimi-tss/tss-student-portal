"use client";

import { useEffect, useState } from "react";
import type { DigestEvent, DigestFeature } from "@/lib/digest/content";
import { eventDateLabel } from "@/lib/digest/content";
import styles from "../../admin.module.css";

interface Draft {
  position: 1 | 2;
  heading: string;
  body: string;
  imageUrl: string;
  buttonLabel: string;
  buttonUrl: string;
}

const toDraft = (position: 1 | 2, f?: DigestFeature): Draft => ({
  position,
  heading: f?.heading ?? "",
  body: f?.body ?? "",
  imageUrl: f?.imageUrl ?? "",
  buttonLabel: f?.buttonLabel ?? "",
  buttonUrl: f?.buttonUrl ?? "",
});

const field: React.CSSProperties = { width: "100%", padding: 8, borderRadius: 8, font: "inherit", marginTop: 4 };
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginTop: 12 };

export default function WeeklyEmailEditor({
  weekLabel,
  initialFeatures,
  initialEvents,
}: {
  weekLabel: string;
  initialFeatures: DigestFeature[];
  initialEvents: DigestEvent[];
}) {
  const [boxes, setBoxes] = useState<Draft[]>([
    toDraft(1, initialFeatures.find((f) => f.position === 1)),
    toDraft(2, initialFeatures.find((f) => f.position === 2)),
  ]);
  const [events, setEvents] = useState<DigestEvent[]>(initialEvents);
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const [preview, setPreview] = useState("");

  function update(position: 1 | 2, patch: Partial<Draft>) {
    setBoxes((prev) => prev.map((b) => (b.position === position ? { ...b, ...patch } : b)));
    setStatus("");
  }

  // Live preview of the real template, debounced.
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch("/api/admin/weekly-email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: boxes, upcoming: events }),
      });
      if (res.ok) setPreview((await res.json()).html);
    }, 400);
    return () => clearTimeout(t);
  }, [boxes, events]);

  async function save() {
    setStatus("Saving…");
    const res = await fetch("/api/admin/weekly-email/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features: boxes }),
    });
    const body = await res.json().catch(() => ({}));
    setStatus(res.ok ? "Saved ✓" : body.error ?? "Couldn't save");
  }

  async function uploadImage(position: 1 | 2, file: File) {
    setUploading(position);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/weekly-email/image", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setUploading(null);
    if (res.ok) update(position, { imageUrl: body.url });
    else setStatus(body.error ?? "Upload failed");
  }

  async function addEvent() {
    const res = await fetch("/api/admin/weekly-email/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventDate: newDate, title: newTitle }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setStatus(body.error ?? "Couldn't add");
    setEvents((prev) => [...prev, body.event].sort((a, b) => a.eventDate.localeCompare(b.eventDate)));
    setNewDate("");
    setNewTitle("");
  }

  async function removeEvent(id: string) {
    const res = await fetch(`/api/admin/weekly-email/events?id=${id}`, { method: "DELETE" });
    if (res.ok) setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 420px", minWidth: 320 }}>
        <p className={styles.panelText}>
          These boxes go in every student&apos;s <strong>{weekLabel}</strong> email, after their own lessons and
          practice. Leave a field empty to hide it; leave a whole box empty to skip it.
        </p>

        {boxes.map((b) => (
          <div key={b.position} className={styles.panel} style={{ marginTop: 16 }}>
            <p className={styles.panelText} style={{ fontWeight: 700 }}>Box {b.position}</p>
            <label style={label}>
              Heading
              <input style={field} value={b.heading} maxLength={120} onChange={(e) => update(b.position, { heading: e.target.value })} />
            </label>
            <label style={label}>
              Body text
              <textarea
                style={field}
                rows={4}
                value={b.body}
                maxLength={1500}
                onChange={(e) => update(b.position, { body: e.target.value })}
              />
            </label>
            <label style={label}>
              Image
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: "block", marginTop: 4 }}
                disabled={uploading === b.position}
                onChange={(e) => e.target.files?.[0] && uploadImage(b.position, e.target.files[0])}
              />
            </label>
            {uploading === b.position && <p className={styles.panelText}>Uploading…</p>}
            {b.imageUrl && (
              <div style={{ marginTop: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.imageUrl} alt="" style={{ maxWidth: 200, borderRadius: 8, display: "block" }} />
                <button type="button" onClick={() => update(b.position, { imageUrl: "" })} style={{ marginTop: 4, fontSize: 12, textDecoration: "underline", background: "none", border: 0, cursor: "pointer", color: "inherit" }}>
                  Remove image
                </button>
              </div>
            )}
            <label style={label}>
              Button name
              <input style={field} value={b.buttonLabel} maxLength={60} placeholder="e.g. JOIN THE CHALLENGE" onChange={(e) => update(b.position, { buttonLabel: e.target.value })} />
            </label>
            <label style={label}>
              Link to button
              <input style={field} value={b.buttonUrl} maxLength={500} placeholder="https://…" onChange={(e) => update(b.position, { buttonUrl: e.target.value })} />
            </label>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button type="button" className={styles.cta} onClick={save}>
            Save boxes
          </button>
          {status && <span className={styles.panelText}>{status}</span>}
        </div>

        <div className={styles.panel} style={{ marginTop: 24 }}>
          <p className={styles.panelText} style={{ fontWeight: 700 }}>What&apos;s Coming Up</p>
          <p className={styles.panelText}>
            Shown at the bottom of every weekly email. Past dates drop off automatically.
          </p>
          {events.length === 0 && <p className={styles.panelText}>Nothing added yet.</p>}
          {events.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 14 }}>
              <strong style={{ minWidth: 60 }}>{eventDateLabel(e.eventDate)}</strong>
              <span style={{ flex: 1 }}>{e.title}</span>
              <button type="button" onClick={() => removeEvent(e.id)} style={{ fontSize: 12, textDecoration: "underline", background: "none", border: 0, cursor: "pointer", color: "inherit" }}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ ...field, width: 160, marginTop: 0 }} />
            <input
              value={newTitle}
              maxLength={120}
              placeholder="e.g. How To Use The App"
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ ...field, flex: 1, minWidth: 180, marginTop: 0 }}
            />
            <button type="button" className={styles.cta} onClick={addEvent}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: "1 1 420px", minWidth: 320, position: "sticky", top: 16 }}>
        <p className={styles.panelText} style={{ fontWeight: 700 }}>Preview (sample student)</p>
        <iframe title="Weekly email preview" srcDoc={preview} style={{ width: "100%", height: 900, border: "1px solid #ccc", borderRadius: 8, background: "#fff" }} />
      </div>
    </div>
  );
}
