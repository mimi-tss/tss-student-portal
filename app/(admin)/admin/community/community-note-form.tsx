"use client";

import { useState } from "react";
import styles from "../../admin.module.css";

// Admin box for the digest's "This week in Backstage" section. One line
// per item; blank = students see the standing "join the conversation"
// invite instead.
export default function CommunityNoteForm({ weekLabel, initial }: { weekLabel: string; initial: string }) {
  const [body, setBody] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving");
    const res = await fetch("/api/admin/digest-community-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      setStatus("saved");
    } else {
      setError((await res.json().catch(() => ({})))?.error ?? "Couldn't save");
      setStatus("error");
    }
  }

  return (
    <div className={styles.panel} style={{ marginTop: 16 }}>
      <p className={styles.panelText} style={{ fontWeight: 600 }}>This week in Backstage — for the {weekLabel} digest</p>
      <p className={styles.panelText}>
        Goes in every student&apos;s Monday email. One line per item, e.g. &ldquo;Thursday 7 PM ET: Open Mic night&rdquo;.
        Leave blank to show the standard &ldquo;Join the conversation in Backstage&rdquo; invite.
      </p>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setStatus("idle");
        }}
        rows={4}
        maxLength={600}
        placeholder={"Thursday 7 PM ET: Open Mic night\nNew challenge: 7 days of lip trills"}
        style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, font: "inherit" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button type="button" className={styles.cta} onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && <span className={styles.panelText}>Saved ✓</span>}
        {status === "error" && <span className={styles.errorText}>{error}</span>}
      </div>
    </div>
  );
}
