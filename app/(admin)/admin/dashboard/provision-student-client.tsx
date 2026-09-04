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
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("suite");
  const [coachId, setCoachId] = useState("");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);
  const [ambassador, setAmbassador] = useState(false);
  // Explicit choice, independent of tier — provisionStudent() otherwise
  // falls back to its old implicit "Suite always gets one" rule when
  // this isn't sent at all, but this form always sends it, so this
  // checkbox is the actual decision for anyone added here. Starts
  // checked to match that old default (this form's own tier default is
  // also "suite"), not auto-synced to tier after that — an admin who
  // changes tier keeps whatever they last set here.
  const [grantTrial, setGrantTrial] = useState(true);
  const [lessonType, setLessonType] = useState<LessonType>("none");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("16:00");
  const [startDate, setStartDate] = useState(todayLocal());
  const [creditExpiresAt, setCreditExpiresAt] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [billingStartDate, setBillingStartDate] = useState("");
  const [studentSince, setStudentSince] = useState("");
  const [coachSince, setCoachSince] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
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
        grantTrial,
        lessonType: lessonType === "none" ? undefined : lessonType,
        dayOfWeek: needsSchedule ? dayOfWeek : undefined,
        startTime: needsSchedule ? startTime : undefined,
        startDate: needsSchedule ? startDate : undefined,
        creditExpiresAt: needsCredit ? new Date(`${creditExpiresAt}T23:59:59`).toISOString() : undefined,
        birthDate: birthDate || undefined,
        billingAnniversaryDate: billingStartDate || undefined,
        studentSinceOverride: studentSince || undefined,
        coachStartDateOverride: coachSince || undefined,
        phone: phone.trim() || undefined,
        gender: gender.trim() || undefined,
        addressStreet: addressStreet.trim() || undefined,
        addressCity: addressCity.trim() || undefined,
        addressState: addressState.trim() || undefined,
        addressZip: addressZip.trim() || undefined,
        addressCountry: addressCountry.trim() || undefined,
        guardianName: guardianName.trim() || undefined,
        guardianRelationship: guardianRelationship.trim() || undefined,
        guardianPhone: guardianPhone.trim() || undefined,
        guardianEmail: guardianEmail.trim() || undefined,
      }),
    });

    setSaving(false);

    if (res.ok) {
      setEmail("");
      setName("");
      setAmbassador(false);
      setGrantTrial(true);
      setLessonType("none");
      setCreditExpiresAt("");
      setBirthDate("");
      setBillingStartDate("");
      setStudentSince("");
      setCoachSince("");
      setPhone("");
      setGender("");
      setAddressStreet("");
      setAddressCity("");
      setAddressState("");
      setAddressZip("");
      setAddressCountry("");
      setGuardianName("");
      setGuardianRelationship("");
      setGuardianPhone("");
      setGuardianEmail("");
      setOpen(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setErrorMsg(body.error ?? "Could not add student.");
    }
  }

  if (!open) {
    return (
      <div className={styles.panel}>
        <button onClick={() => setOpen(true)} className={styles.cta}>
          Add A New Student
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.panel}>
      <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Add ambassador / manual student</h2>
        <button type="button" className={styles.linkBtnSmall} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
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
        <div className={styles.field}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={grantTrial}
              onChange={(e) => setGrantTrial(e.target.checked)}
            />
            Grant a free trial lesson
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

      <h3 style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Dates (optional)
      </h3>
      <div className={styles.rowForm} style={{ marginTop: 10 }}>
        <div className={styles.field}>
          <label>Birthday</label>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Billing start date</label>
          <input
            type="date"
            value={billingStartDate}
            onChange={(e) => setBillingStartDate(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Student since</label>
          <input type="date" value={studentSince} onChange={(e) => setStudentSince(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Coach since</label>
          <input type="date" value={coachSince} onChange={(e) => setCoachSince(e.target.value)} className={styles.input} />
        </div>
      </div>

      <h3 style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Contact &amp; guardian info (optional)
      </h3>
      <div className={styles.rowForm} style={{ marginTop: 10 }}>
        <div className={styles.field}>
          <label>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Gender</label>
          <input value={gender} onChange={(e) => setGender(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Street</label>
          <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>City</label>
          <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>State</label>
          <input value={addressState} onChange={(e) => setAddressState(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Zip</label>
          <input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Country</label>
          <input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} className={styles.input} />
        </div>
      </div>
      <div className={styles.rowForm} style={{ marginTop: 10 }}>
        <div className={styles.field}>
          <label>Guardian name</label>
          <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Guardian relationship</label>
          <input
            value={guardianRelationship}
            onChange={(e) => setGuardianRelationship(e.target.value)}
            placeholder="e.g. Mother, Father"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Guardian phone</label>
          <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label>Guardian email</label>
          <input
            type="email"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>

      <button type="submit" disabled={saving} className={styles.cta} style={{ marginTop: 12 }}>
        {saving ? "Adding…" : "Add"}
      </button>
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
    </form>
  );
}
