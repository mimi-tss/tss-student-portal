"use client";

import { useState } from "react";

export default function AddCreditClient({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!expiresAt) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/add-credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(),
        durationMinutes,
      }),
    });

    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setOpen(false);
      setExpiresAt("");
      setDurationMinutes(30);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add credit.");
    }
  }

  if (!open) {
    return (
      <div>
        <button onClick={() => setOpen(true)} className="text-xs text-blue-600 underline">
          {saved ? "Add another credit" : "Add credit"}
        </button>
        {saved && <p className="text-xs text-green-700">Credit added</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(Number(e.target.value))}
        className="rounded border px-1 py-0.5 text-xs"
      >
        <option value={30}>30 min</option>
        <option value={60}>60 min</option>
      </select>
      <input
        type="date"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        className="rounded border px-1 py-0.5 text-xs"
      />
      <button
        onClick={handleAdd}
        disabled={!expiresAt || saving}
        className="rounded bg-black px-2 py-0.5 text-xs text-white disabled:opacity-50"
      >
        {saving ? "…" : "Add"}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-gray-500 underline">
        Cancel
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
