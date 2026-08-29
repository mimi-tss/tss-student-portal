"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../admin.module.css";
import EditStudentModal, { type EditStudentInitial } from "./edit-student-modal";

interface Coach {
  id: string;
  name: string;
}

// Single entry point for everything that used to be a dozen separate
// click-to-edit fields scattered down the page — one "Edit" button next
// to the name opens one modal with all of it. Archive sits right next
// to it (same reversible hide as the Students list's own Archive
// button, just reachable from the student's own page too).
export default function StudentHeaderActions({
  studentId,
  name,
  archived,
  initial,
  coaches,
}: {
  studentId: string;
  name: string;
  archived: boolean;
  initial: EditStudentInitial;
  coaches: Coach[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [isArchived, setIsArchived] = useState(archived);

  async function handleArchiveToggle() {
    setArchiving(true);
    const res = await fetch("/api/admin/archive-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, archived: !isArchived }),
    });
    setArchiving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? "Could not update archive status.");
      return;
    }

    setIsArchived(!isArchived);
    router.refresh();
  }

  return (
    <>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
        <h1 className={styles.pageTitle} style={{ marginBottom: 0 }}>
          {name}
        </h1>
        <button onClick={() => setEditing(true)} className={styles.linkBtnSmall}>
          Edit
        </button>
        <button onClick={handleArchiveToggle} disabled={archiving} className={styles.linkBtnSmall}>
          {archiving ? "…" : isArchived ? "Unarchive" : "Archive"}
        </button>
        {isArchived && <span className={styles.mutedText}>Archived</span>}
      </span>

      {editing && (
        <EditStudentModal
          studentId={studentId}
          initial={initial}
          coaches={coaches}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
