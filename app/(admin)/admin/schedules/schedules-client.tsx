"use client";

import { useState } from "react";
import CoachCalendar from "@/components/coach-calendar";

interface Coach {
  id: string;
  name: string;
}

// Admin views any coach's calendar, always normalized to Eastern
// (TSS_App_Spec_1.md section 8) regardless of that coach's own
// timezone — CoachCalendar's displayTimeZone override handles the actual
// conversion; this just picks which coach to look at.
export default function SchedulesClient({ coaches }: { coaches: Coach[] }) {
  const [selectedCoachId, setSelectedCoachId] = useState(coaches[0]?.id ?? "");

  return (
    <div>
      <div className="mb-6">
        <label className="mr-2 text-sm text-gray-500">Coach</label>
        <select
          value={selectedCoachId}
          onChange={(e) => setSelectedCoachId(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.name}
            </option>
          ))}
        </select>
      </div>

      {selectedCoachId && (
        <CoachCalendar
          scheduleEndpoint={`/api/admin/coach-schedule?coachId=${selectedCoachId}`}
          displayTimeZone="America/New_York"
        />
      )}

      {coaches.length === 0 && <p className="text-gray-500">No coaches yet.</p>}
    </div>
  );
}
