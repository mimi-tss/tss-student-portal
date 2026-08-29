"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../admin.module.css";

interface Coach {
  id: string;
  name: string;
}

export interface EditStudentInitial {
  name: string;
  email: string;
  phone: string | null;
  gender: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  addressCountry: string | null;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  tier: string;
  cadence: "weekly" | "biweekly";
  ambassador: boolean;
  referredByCoachId: string | null;
  birthDate: string | null;
  coachStartDateOverride: string | null;
  derivedCoachStartValue: string | null;
  studentSinceOverride: string | null;
  createdAt: string;
  billingAnniversaryDate: string | null;
}

const TIER_OPTIONS = ["lite", "suite", "pro", "elite"];
const TIER_LABEL: Record<string, string> = { lite: "Lite", suite: "Suite", pro: "Pro", elite: "Elite" };

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "56px 16px",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: "100%" }}>
        {children}
      </div>
    </div>
  );
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// One consolidated editor for everything on the student detail page that
// used to be a dozen separate click-to-edit fields — you asked for a
// single "Edit" entry point instead of an Edit link on every row. Saves
// by calling each field's own existing route (unchanged, still doing
// their own validation/side-effects — e.g. set-billing-anniversary still
// regenerates recurring sessions under the corrected anchor) rather than
// one new mega-endpoint, so none of that existing behavior needed
// touching. Everything is sent every time except tier (only sent if
// changed, since it triggers a confirm) and billing anniversary (only
// sent if changed and non-blank, since that route requires a value and
// has a real side effect worth not re-triggering on every unrelated
// save).
export default function EditStudentModal({
  studentId,
  initial,
  coaches,
  onClose,
}: {
  studentId: string;
  initial: EditStudentInitial;
  coaches: Coach[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [gender, setGender] = useState(initial.gender ?? "");
  const [addressStreet, setAddressStreet] = useState(initial.addressStreet ?? "");
  const [addressCity, setAddressCity] = useState(initial.addressCity ?? "");
  const [addressState, setAddressState] = useState(initial.addressState ?? "");
  const [addressZip, setAddressZip] = useState(initial.addressZip ?? "");
  const [addressCountry, setAddressCountry] = useState(initial.addressCountry ?? "");
  const [guardianName, setGuardianName] = useState(initial.guardianName ?? "");
  const [guardianRelationship, setGuardianRelationship] = useState(initial.guardianRelationship ?? "");
  const [guardianPhone, setGuardianPhone] = useState(initial.guardianPhone ?? "");
  const [guardianEmail, setGuardianEmail] = useState(initial.guardianEmail ?? "");
  const [tier, setTier] = useState(initial.tier);
  const [ambassador, setAmbassador] = useState(initial.ambassador);
  const [referredByCoachId, setReferredByCoachId] = useState(initial.referredByCoachId ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [coachStartDateOverride, setCoachStartDateOverride] = useState(initial.coachStartDateOverride ?? "");
  const [studentSinceOverride, setStudentSinceOverride] = useState(initial.studentSinceOverride ?? "");
  const [billingAnniversaryDate, setBillingAnniversaryDate] = useState(initial.billingAnniversaryDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }

    let tierToSave = tier;
    if (tier !== initial.tier) {
      const confirmed = window.confirm(
        "This overwrites the membership tier Kajabi has on file for this student. It won't stop Kajabi " +
          "from syncing — the next real purchase or plan change there will overwrite this again automatically. Continue?",
      );
      if (!confirmed) {
        tierToSave = initial.tier;
        setTier(initial.tier);
      }
    }

    setSaving(true);
    setError(null);

    const requests: Promise<Response>[] = [
      postJson("/api/admin/set-student-info", { studentId, name: name.trim(), email, phone, gender }),
      postJson("/api/admin/set-address", {
        studentId,
        street: addressStreet,
        city: addressCity,
        state: addressState,
        zip: addressZip,
        country: addressCountry,
      }),
      postJson("/api/admin/set-guardian-info", {
        studentId,
        name: guardianName,
        relationship: guardianRelationship,
        phone: guardianPhone,
        email: guardianEmail,
      }),
      postJson("/api/admin/set-referral", { studentId, coachId: referredByCoachId || null }),
      postJson("/api/admin/set-ambassador", { studentId, ambassador }),
      postJson("/api/admin/set-birth-date", { studentId, birthDate: birthDate || null }),
      postJson("/api/admin/set-coach-start-date", { studentId, coachStartDate: coachStartDateOverride || null }),
      postJson("/api/admin/set-student-since", { studentId, studentSince: studentSinceOverride || null }),
    ];

    if (tierToSave !== initial.tier) {
      requests.push(postJson("/api/admin/set-tier", { studentId, tier: tierToSave }));
    }
    if (billingAnniversaryDate && billingAnniversaryDate !== initial.billingAnniversaryDate) {
      requests.push(postJson("/api/admin/set-billing-anniversary", { studentId, billingAnniversaryDate }));
    }

    const results = await Promise.all(requests);
    setSaving(false);

    const failedCount = results.filter((r) => !r.ok).length;
    if (failedCount > 0) {
      setError(`Could not save ${failedCount} of ${results.length} change(s). Please try again.`);
      return;
    }

    window.alert("Saved.");
    router.refresh();
    onClose();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className={styles.panel}>
        <div className={styles.pageHeadRow} style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Edit student info</h2>
          <button className={styles.linkBtnSmall} onClick={onClose}>
            Close
          </button>
        </div>

        <h3 style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Basic info
        </h3>
        <div className={styles.rowForm} style={{ marginTop: 10 }}>
          <div className={styles.field}>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>Gender</label>
            <input value={gender} onChange={(e) => setGender(e.target.value)} className={styles.input} />
          </div>
        </div>

        <h3 style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Address
        </h3>
        <div className={styles.rowForm} style={{ marginTop: 10 }}>
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

        <h3 style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Guardian (if minor)
        </h3>
        <div className={styles.rowForm} style={{ marginTop: 10 }}>
          <div className={styles.field}>
            <label>Name</label>
            <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>Relationship</label>
            <input
              value={guardianRelationship}
              onChange={(e) => setGuardianRelationship(e.target.value)}
              placeholder="e.g. Mother, Father"
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>Phone</label>
            <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              value={guardianEmail}
              onChange={(e) => setGuardianEmail(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        <h3 style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Membership
        </h3>
        <div className={styles.rowForm} style={{ marginTop: 10 }}>
          <div className={styles.field}>
            <label>Tier{initial.cadence === "biweekly" ? ` (${TIER_LABEL[tier]} Biweekly)` : ""}</label>
            <select value={tier} onChange={(e) => setTier(e.target.value)} className={styles.select}>
              {TIER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Referred by</label>
            <select
              value={referredByCoachId}
              onChange={(e) => setReferredByCoachId(e.target.value)}
              className={styles.select}
            >
              <option value="">Not referred</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={ambassador} onChange={(e) => setAmbassador(e.target.checked)} />
              Ambassador
            </label>
          </div>
        </div>

        <h3 style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Dates
        </h3>
        <div className={styles.rowForm} style={{ marginTop: 10 }}>
          <div className={styles.field}>
            <label>Birthday</label>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>With coach since</label>
            <input
              type="date"
              value={coachStartDateOverride}
              onChange={(e) => setCoachStartDateOverride(e.target.value)}
              className={styles.input}
            />
            {!coachStartDateOverride && initial.derivedCoachStartValue && (
              <span className={styles.mutedText} style={{ fontSize: 11 }}>
                auto: {initial.derivedCoachStartValue}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label>With us</label>
            <input
              type="date"
              value={studentSinceOverride}
              onChange={(e) => setStudentSinceOverride(e.target.value)}
              className={styles.input}
            />
            {!studentSinceOverride && (
              <span className={styles.mutedText} style={{ fontSize: 11 }}>
                auto: {initial.createdAt.slice(0, 10)}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label>Billing cycle anchor</label>
            <input
              type="date"
              value={billingAnniversaryDate}
              onChange={(e) => setBillingAnniversaryDate(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className={styles.cta} style={{ marginTop: 16 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {error && <p className={styles.errorText} style={{ marginTop: 8 }}>{error}</p>}
      </div>
    </ModalOverlay>
  );
}
