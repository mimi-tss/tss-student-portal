import Link from "next/link";

// Student dashboard: upcoming sessions, makeup credits, renewal date.
// See TSS_App_Spec_1.md section 8 (Student side).
export default function StudentDashboardPage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Student Dashboard</h1>
      <Link
        href="/student/book"
        className="mt-4 inline-block rounded bg-black px-4 py-2 text-white"
      >
        Book / reschedule a session
      </Link>
    </main>
  );
}
