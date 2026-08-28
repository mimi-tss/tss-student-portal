"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DAY_NAMES } from "@/lib/scheduling/recurring";
import styles from "../../admin.module.css";

interface Coach {
  id: string;
  name: string;
  timezone: string;
}

type LessonType = "none" | "weekly" | "biweekly" | "4pack";

// "Today" as a plain YYYY-MM-DD in the browser's own zone — good enough
// for the schedule's default start date and the 4-pack expiry's min
// bound, neither of which need coach-zone precision the way an actual
// lesson time does.
function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Manual student provisioning — for ambassadors (Grant Offer / 100%-off
// coupon), which don't fire a Kajabi webhook. See
// app/api/admin/provision-student/route.ts. lessonType optionally sets
// the student's weekly/biweekly recurring schedule or grants a 4-pack of
// credits in the same request, so admin doesn't have to open the new
// student's profile separately just to do that — same three options
// (weekly/biweekly/4-pack) available from there, just reachable at
// creation time too. Left at "Not set yet", nothing beyond the student
// row itself is created, same as before this existed.
export default function ProvisionStudentClient({ coaches }: { coaches: Coach[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("suite");
  const [coachId, setCoachId] = useState("");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);
  const [ambassador, setAmbassador] = useState(false);
  const [lessonType, setLessonType] = useState<LessonType>("none");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("16:00");
  const [startDate, setStartDate] = useState(todayLocal());
  const [creditExpiresAt, setCreditExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const needsSchedule = lessonType === "weekly" || lessonType === "biweekly";
  const needsCredit = lessonType === "4pack";
  const coachTimeZone = coaches.find((c) => c.id === coachId)?.timezone;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (needsSchedule && !coachId) {
      setErrorMsg("Pick a coach to set a weekly/biweekly schedule.");
      return;
    }
    if (needsCredit && !creditExpiresAt) {
      setErrorMsg("Pick an expiry date to grant a 4-pack.");
      return;
    }

    setSaving(true);

    const res = await fetch("/api/admin/provision-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        tier,
        coachId: coachId || undefined,
        sessionDurationMinutes,
        ambassador,
        lessonType: lessonType === "none" ? undefined : lessonType,
        dayOfWeek: needsSchedule ? dayOfWeek : undefined,
        startTime: needsSchedule ? startTime : undefined,
        startDate: needsSchedule ? startDate : undefined,
        creditExpiresAt: needsCredit ? new Date(`${creditExpiresAt}T23:59:59`).toISOString() : undefined,
      }),
    });

    setSaving(false);

    if (res.ok) {
      setEmail("");
      setName("");
      setAmbassador(false);
      setLessonType("none");
      setCreditExpiresAt("");
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
          <label>Coach{needsSchedule ? "" : " (optional)"}</label>
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={styles.select}>
            <option value="">None yet</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Lesson type</label>
          <select
            value={lessonType}
            onChange={(e) => setLessonType(e.target.value as LessonType)}
            className={styles.select}
          >
            <option value="none">Not set yet</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="4pack">4-pack</option>
          </select>
        </div>
        <div className={styles.field}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={ambassador}
              onChange={(e) => setAmbassador(e.target.checked)}
            />
            Ambassador
          </label>
        </div>
      </div>

      {needsSchedule && (
        <div className={styles.rowForm} style={{ marginTop: 10 }}>
          <div className={styles.field}>
            <label>Day</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className={styles.select}
            >
              {DAY_NAMES.map((dayName, i) => (
                <option key={i} value={i}>
                  {dayName}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Time{coachTimeZone ? ` (${coachTimeZone.replace(/_/g, " ")})` : ""}</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>Starting</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>
      )}

      {needsCredit && (
        <div className={styles.rowForm} style={{ marginTop: 10 }}>
          <div className={styles.field}>
            <label>4-pack expires</label>
            <input
              type="date"
              value={creditExpiresAt}
              onChange={(e) => setCreditExpiresAt(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>
      )}

      <button type="submit" disabled={saving} className={styles.cta} style={{ marginTop: 12 }}>
        {saving ? "Adding…" : "Add"}
      </button>
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
    </form>
  );
}
