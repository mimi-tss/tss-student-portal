"use client";

import { useState } from "react";
import styles from "../../admin.module.css";

export default function DncToggleClient({
  studentId,
  initialStatus,
}: {
  studentId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = status === "dnc" ? "ok" : "dnc";
    setSaving(true);
    const res = await fetch("/api/admin/set-dnc-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, status: next }),
    });
    setSaving(false);
    if (res.ok) setStatus(next);
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className={status === "dnc" ? styles.badgeWarn : styles.badgeMuted}
      style={{ border: "none", cursor: "pointer", font: "inherit" }}
      title={status === "dnc" ? "Click to clear DNC" : "Click to flag DNC"}
    >
      {status === "dnc" ? "DNC" : "OK"}
    </button>
  );
}
