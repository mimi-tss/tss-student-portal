"use client";

import Link from "next/link";
import { useState } from "react";
import AssignCoachClient from "./assign-coach-client";
import AddCreditClient from "./add-credit-client";

interface Student {
  id: string;
  name: string;
  email: string;
  tier: string;
  assigned_coach_id: string | null;
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
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students by name…"
        className="mb-4 w-full max-w-xs rounded border px-2 py-1 text-sm"
      />

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="py-2">Name</th>
            <th className="py-2">Tier</th>
            <th className="py-2">Assigned coach</th>
            <th className="py-2">Trial lesson</th>
            <th className="py-2">Extra lesson credit</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((student) => (
            <tr key={student.id} className="border-b">
              <td className="py-2">
                <Link
                  href={`/admin/students/${student.id}`}
                  className="font-medium text-blue-600 underline"
                >
                  {student.name}
                </Link>
                <div className="text-xs text-gray-500">{student.email}</div>
              </td>
              <td className="py-2 capitalize">{student.tier}</td>
              <td className="py-2">
                <AssignCoachClient
                  studentId={student.id}
                  currentCoachId={student.assigned_coach_id}
                  coaches={coaches}
                />
              </td>
              <td className="py-2">
                {trialSet.has(student.id) ? (
                  <Link
                    href={`/admin/book-trial/${student.id}`}
                    className="text-blue-600 underline"
                  >
                    Book trial
                  </Link>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="py-2">
                <AddCreditClient studentId={student.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <p className="text-gray-500">
          {students.length === 0 ? "No students yet." : "No students match that search."}
        </p>
      )}
    </div>
  );
}
