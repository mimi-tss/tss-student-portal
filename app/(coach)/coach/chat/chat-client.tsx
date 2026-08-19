"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ChatPanel from "@/components/chat-panel";

interface Student {
  id: string;
  name: string;
}

export default function CoachChatClient({ currentProfileId }: { currentProfileId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/coach/students")
      .then((res) => res.json())
      .then((data) => setStudents(data.students ?? []));
  }, []);

  return (
    <div className="flex gap-6">
      <ul className="w-48 shrink-0 space-y-1">
        {students.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => setSelectedId(s.id)}
              className={`w-full rounded px-3 py-2 text-left text-sm ${
                selectedId === s.id ? "bg-black text-white" : "hover:bg-gray-50"
              }`}
            >
              {s.name}
            </button>
          </li>
        ))}
        {students.length === 0 && (
          <li className="text-sm text-gray-500">No assigned students yet.</li>
        )}
      </ul>

      <div className="flex-1">
        {selectedId ? (
          <>
            <Link
              href={`/coach/students/${selectedId}`}
              className="mb-2 inline-block text-xs text-blue-600 underline"
            >
              View student dashboard
            </Link>
            <ChatPanel
              key={selectedId}
              studentId={selectedId}
              currentProfileId={currentProfileId}
            />
          </>
        ) : (
          <p className="text-sm text-gray-500">Pick a student to view the conversation.</p>
        )}
      </div>
    </div>
  );
}
