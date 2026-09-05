"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ChatPanel from "@/components/chat-panel";
import styles from "../../coach.module.css";

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
    <div className={styles.chatLayout}>
      <ul className={styles.chatSidebar} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {students.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => setSelectedId(s.id)}
              className={`${styles.chatSidebarBtn} ${selectedId === s.id ? styles.chatSidebarBtnActive : ""}`}
            >
              {s.name}
            </button>
          </li>
        ))}
        {students.length === 0 && (
          <li className={styles.panelText}>No assigned students yet.</li>
        )}
      </ul>

      <div className="flex-1">
        {selectedId ? (
          <>
            <Link href={`/coach/students/${selectedId}`} className={styles.backLink}>
              View student dashboard
            </Link>
            <ChatPanel
              key={selectedId}
              studentId={selectedId}
              currentProfileId={currentProfileId}
            />
          </>
        ) : (
          <p className={styles.panelText}>Pick a student to view the conversation.</p>
        )}
      </div>
    </div>
  );
}
