"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, X } from "lucide-react";
import tokens from "@/app/theme-tokens.module.css";
import BugReportForm from "./bug-report-form";
import styles from "./bug-report-button.module.css";

// "Beta · Found a bug? Report" — lives in the student + coach headers.
// Opens a modal around BugReportForm (components/bug-report-form.tsx);
// the same form is also the public, shareable /report-bug page. Admin
// reviews reports at /admin/bug-reports.
//
// The modal is portaled to <body> because both headers are sticky with
// backdrop-filter, which makes them the containing block for any
// position:fixed descendant — rendered in place, the overlay would be
// clipped to the header strip. Portaling out loses the route group's
// .root tokens, so the overlay re-applies the shared tokens class itself.
//
// Other UI (the phone avatar menu, components/profile-menu.tsx) opens the
// modal by dispatching this on window, since the header pill itself is
// hidden on phones.
export const OPEN_BUG_REPORT_EVENT = "open-bug-report";

export default function BugReportButton({ defaultEmail }: { defaultEmail: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener(OPEN_BUG_REPORT_EVENT, openIt);
    return () => window.removeEventListener(OPEN_BUG_REPORT_EVENT, openIt);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className={styles.pill}>
        <Bug size={16} className={styles.pillIcon} aria-hidden />
        <span className={styles.pillText}>
          Beta · <span className={styles.pillMuted}>Found a bug?</span>
        </span>
        <button type="button" className={styles.pillButton} onClick={() => setOpen(true)}>
          Report
        </button>
      </div>

      {open &&
        createPortal(
          <div
            className={`${tokens.tokens} ${styles.overlay}`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
              <div className={styles.modalHead}>
                <h2 id="bug-report-title" className={styles.title}>
                  Report an Issue
                </h2>
                <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
                  <X size={20} />
                </button>
              </div>
              <BugReportForm
                defaultEmail={defaultEmail}
                onCancel={() => setOpen(false)}
                onDone={() => setOpen(false)}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
