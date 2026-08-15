"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Coach {
  id: string;
  name: string;
}

// Manual student provisioning — for ambassadors (Grant Offer / 100%-off
// coupon), which don't fire a Kajabi webhook. See
// app/api/admin/provision-student/route.ts.
export default function ProvisionStudentClient({ coaches }: { coaches: Coach[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("suite");
  const [coachId, setCoachId] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const res = await fetch("/api/admin/provision-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, tier, coachId: coachId || undefined }),
    });

    setSaving(false);

    if (res.ok) {
      setEmail("");
      setName("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setErrorMsg(body.error ?? "Could not add student.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-gray-500">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded border px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded border px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Tier</label>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="suite">Suite</option>
          <option value="pro">Pro</option>
          <option value="elite">Elite</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500">Coach (optional)</label>
        <select
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">None yet</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add ambassador / manual student"}
      </button>
      {errorMsg && <p className="w-full text-sm text-red-600">{errorMsg}</p>}
    </form>
  );
}
