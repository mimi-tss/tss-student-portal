"use client";

import Link from "next/link";
import { useState } from "react";
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
  const [search, setSearch] = useState("");
  const trialSet = new Set(studentsWithUnusedTrial);

  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className={styles.panel}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students by name…"
        className={styles.searchInput}
      />

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Tier</th>
            <th>DNC</th>
            <th>Assigned coach</th>
            <th>Trial lesson</th>
            <th>Session credit</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((student) => (
            <tr key={student.id}>
              <td>
                <Link href={`/admin/students/${student.id}`} className={styles.rowName}>
                  {student.name}
                </Link>
                <div className={styles.rowSub}>{student.email}</div>
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
                  <Link href={`/admin/book-trial/${student.id}`} className={styles.linkBtnSmall}>
                    Book trial
                  </Link>
                ) : (
                  <span className={styles.mutedText}>—</span>
                )}
              </td>
              <td>
                <AddCreditClient studentId={student.id} />
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
