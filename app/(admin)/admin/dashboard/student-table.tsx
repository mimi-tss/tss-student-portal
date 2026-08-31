"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AssignCoachClient from "./assign-coach-client";
import AddCreditClient from "./add-credit-client";
import DncToggleClient from "./dnc-toggle-client";
import styles from "../../admin.module.css";

interface Student {
  id: string;
  name: string;
  email: string;
  tier: string;
  assigned_coach_id: string | null;
  payment_status: string;
  archived: boolean;
}

interface Coach {
  id: string;
  name: string;
}

export default function StudentTable({
  students,
  coaches,
  studentsWithUnusedTrial,
}: {
  students: Student[];
  coaches: Coach[];
  studentsWithUnusedTrial: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const trialSet = new Set(studentsWithUnusedTrial);

  const filtered = students
    .filter((s) => showArchived || !s.archived)
    .filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function handleArchiveToggle(studentId: string, archived: boolean) {
    setBusyId(studentId);
    await fetch("/api/admin/archive-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, archived }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function handleRemoveTrial(student: Student) {
    const confirmed = window.confirm(`Remove ${student.name}'s unused trial lesson? This can't be undone.`);
    if (!confirmed) return;

    setBusyId(student.id);
    const res = await fetch("/api/admin/remove-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id }),
    });
    setBusyId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? "Could not remove that trial lesson.");
      return;
    }

    router.refresh();
  }

  async function handleDelete(student: Student) {
    const confirmed = window.confirm(
      `Permanently delete ${student.name}? This deletes every session, credit, note, and chat message they have — everything. This cannot be undone.\n\nIf you just want to hide them from this list, use Archive instead.`,
    );
    if (!confirmed) return;

    setBusyId(student.id);
    const res = await fetch("/api/admin/delete-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id }),
    });
    setBusyId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? "Could not delete that student.");
      return;
    }

    router.refresh();
  }

  return (
    <div className={styles.panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search students by name…"
          className={styles.searchInput}
          style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Tier</th>
            <th>DNC</th>
            <th>Assigned coach</th>
            <th>Trial lesson</th>
            <th>Session credit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((student) => (
            <tr key={student.id} style={student.archived ? { opacity: 0.6 } : undefined}>
              <td>
                <Link href={`/admin/students/${student.id}`} className={styles.rowName}>
                  {student.name}
                </Link>
                <div className={styles.rowSub}>
                  {student.email}
                  {student.archived ? " — archived" : ""}
                </div>
              </td>
              <td className={styles.mutedText} style={{ textTransform: "capitalize" }}>
                {student.tier}
              </td>
              <td>
                <DncToggleClient studentId={student.id} initialStatus={student.payment_status} />
              </td>
              <td>
                <AssignCoachClient
                  studentId={student.id}
                  currentCoachId={student.assigned_coach_id}
                  coaches={coaches}
                />
              </td>
              <td>
                {trialSet.has(student.id) ? (
                  <span style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/admin/book-trial/${student.id}`} className={styles.linkBtnSmall}>
                      Book trial
                    </Link>{" "}
                    <button
                      onClick={() => handleRemoveTrial(student)}
                      disabled={busyId === student.id}
                      className={styles.linkBtnSmall}
                      style={{ color: "var(--coral)" }}
                    >
                      Remove
                    </button>
                  </span>
                ) : (
                  <span className={styles.mutedText}>—</span>
                )}
              </td>
              <td>
                <AddCreditClient studentId={student.id} />
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button
                  onClick={() => handleArchiveToggle(student.id, !student.archived)}
                  disabled={busyId === student.id}
                  className={styles.linkBtnSmall}
                >
                  {student.archived ? "Unarchive" : "Archive"}
                </button>{" "}
                <button
                  onClick={() => handleDelete(student)}
                  disabled={busyId === student.id}
                  className={styles.linkBtnSmall}
                  style={{ color: "var(--coral)" }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <p className={styles.emptyState}>
          {students.length === 0 ? "No students yet." : "No students match that search."}
        </p>
      )}
    </div>
  );
}
