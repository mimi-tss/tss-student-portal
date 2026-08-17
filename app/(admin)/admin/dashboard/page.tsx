import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProvisionStudentClient from "./provision-student-client";
import StudentTable from "./student-table";

// Admin dashboard: student list (searchable, click a name to view their
// dashboard) with coach assignment and trial-lesson booking on a
// student's behalf. See TSS_App_Spec_1.md section 8 — full version also
// needs cross-coach payroll visibility, DNC management, and manual
// overrides; not built yet.
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

  const studentsWithUnusedTrial = (unusedTrials ?? []).map((e) => e.student_id);

  return (
    <main className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link href="/admin/schedules" className="text-sm text-blue-600 underline">
          View coach schedules →
        </Link>
      </div>

      <ProvisionStudentClient coaches={coaches ?? []} />

      <StudentTable
        students={students ?? []}
        coaches={coaches ?? []}
        studentsWithUnusedTrial={studentsWithUnusedTrial}
      />
    </main>
  );
}
