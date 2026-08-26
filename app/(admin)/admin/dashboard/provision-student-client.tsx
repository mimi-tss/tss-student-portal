"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../admin.module.css";

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
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const res = await fetch("/api/admin/provision-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        tier,
        coachId: coachId || undefined,
        sessionDurationMinutes,
      }),
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
    <form onSubmit={handleSubmit} className={styles.panel}>
      <h2>Add ambassador / manual student</h2>
      <div className={styles.rowForm}>
        <div className={styles.field}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={styles.select}>
            <option value="suite">Suite</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Session length</label>
          <select
            value={sessionDurationMinutes}
            onChange={(e) => setSessionDurationMinutes(Number(e.target.value))}
            className={styles.select}
          >
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Coach (optional)</label>
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={styles.select}>
            <option value="">None yet</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={saving} className={styles.cta}>
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
    </form>
  );
}
