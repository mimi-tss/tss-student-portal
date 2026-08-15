import CoachCalendar from "@/components/coach-calendar";

// Coach dashboard: full calendar view of their own schedule, in their
// own timezone. See TSS_App_Spec_1.md section 8 (Coach side) — full
// version also needs birthdays-this-week and credits-expiring-soon; not
// built yet.
export default function CoachDashboardPage() {
  return (
    <main className="p-8">
      <CoachCalendar scheduleEndpoint="/api/coach/schedule" />
    </main>
  );
}
