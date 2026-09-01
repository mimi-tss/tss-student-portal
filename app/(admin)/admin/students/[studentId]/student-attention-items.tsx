"use client";

import { useEffect, useState } from "react";
import type { AttentionItem } from "@/lib/admin/attention-items";
import { AttentionItemRow } from "../../attention-item-row";
import styles from "../../../admin.module.css";

// Whatever's still open on the Needs Review queue for THIS student —
// a cancellation request, an expiring credit, a 5th-week upsell
// opportunity, any of it — surfaced right here instead of making admin
// bounce back to the main Needs Review page to act on something they
// found while already looking at this exact student. Same row, same
// actions (note, status buttons, the 5th-week "Add lesson" button) as
// the main queue — just pre-filtered to this student and with the
// redundant "view student" link hidden. Renders nothing at all when
// there's nothing open, so this doesn't clutter every student's page.
export default function StudentAttentionItems({ studentId }: { studentId: string }) {
  const [items, setItems] = useState<AttentionItem[] | null>(null);

  function load() {
    fetch(`/api/admin/attention-items?studentId=${studentId}`)
      .then((res) => res.json())
      .then((data) => setItems((data.items ?? []).filter((i: AttentionItem) => i.status !== "resolved")))
      .catch(() => setItems([]));
  }

  useEffect(load, [studentId]);

  if (!items || items.length === 0) return null;

  return (
    <div className={styles.panel}>
      <h2 style={{ marginBottom: 12 }}>Needs review</h2>
      {items.map((item) => (
        <AttentionItemRow key={item.id} item={item} onChanged={load} showStudentLink={false} />
      ))}
    </div>
  );
}
