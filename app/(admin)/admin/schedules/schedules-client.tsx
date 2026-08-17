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
  const [search, setSearch] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState(coaches[0]?.id ?? "");

  const filtered = coaches.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div>
      <div className="mb-6 flex gap-6">
        <div className="w-48 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coaches…"
            className="mb-2 w-full rounded border px-2 py-1 text-sm"
          />
          <ul className="space-y-1">
            {filtered.map((coach) => (
              <li key={coach.id}>
                <button
                  onClick={() => setSelectedCoachId(coach.id)}
                  className={`w-full rounded px-3 py-2 text-left text-sm ${
                    selectedCoachId === coach.id ? "bg-black text-white" : "hover:bg-gray-50"
                  }`}
                >
                  {coach.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-sm text-gray-500">No coaches match that search.</li>
            )}
          </ul>
        </div>

        <div className="flex-1">
          {selectedCoachId ? (
            <CoachCalendar
              scheduleEndpoint={`/api/admin/coach-schedule?coachId=${selectedCoachId}`}
              displayTimeZone="America/New_York"
            />
          ) : (
            <p className="text-gray-500">Pick a coach to view their schedule.</p>
          )}
        </div>
      </div>

      {coaches.length === 0 && <p className="text-gray-500">No coaches yet.</p>}
    </div>
  );
}
