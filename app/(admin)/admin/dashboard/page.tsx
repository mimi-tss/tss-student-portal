import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AssignCoachClient from "./assign-coach-client";
import ProvisionStudentClient from "./provision-student-client";
import AddCreditClient from "./add-credit-client";

// Admin dashboard: student list with coach assignment and trial-lesson
// booking on a student's behalf. See TSS_App_Spec_1.md section 8 — full
// version also needs cross-coach schedule/payroll visibility, DNC
// management, and manual overrides; not built yet.
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ data: students }, { data: coaches }, { data: unusedTrials }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, email, tier, assigned_coach_id")
      .order("name"),
    supabase.from("coaches").select("id, name").order("name"),
    supabase
      .from("entitlements")
      .select("student_id")
      .eq("perk_type", "trial_lesson")
      .eq("used", false),
  ]);

  const studentsWithUnusedTrial = new Set((unusedTrials ?? []).map((e) => e.student_id));

  return (
    <main className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link href="/admin/schedules" className="text-sm text-blue-600 underline">
          View coach schedules →
        </Link>
      </div>

      <ProvisionStudentClient coaches={coaches ?? []} />

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
          {(students ?? []).map((student) => (
            <tr key={student.id} className="border-b">
              <td className="py-2">
                <div>{student.name}</div>
                <div className="text-xs text-gray-500">{student.email}</div>
              </td>
              <td className="py-2 capitalize">{student.tier}</td>
              <td className="py-2">
                <AssignCoachClient
                  studentId={student.id}
                  currentCoachId={student.assigned_coach_id}
                  coaches={coaches ?? []}
                />
              </td>
              <td className="py-2">
                {studentsWithUnusedTrial.has(student.id) ? (
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

      {(students ?? []).length === 0 && (
        <p className="text-gray-500">No students yet.</p>
      )}
    </main>
  );
}
