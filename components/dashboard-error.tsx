"use client";

import { useEffect } from "react";
import RefreshButton from "./refresh-button";
import SessionResetButton from "./session-reset-button";

// The actual long-run fix for the blank-screen coach report: previously
// this app had NO error boundaries anywhere, so any uncaught render
// error (an expired/malformed session, a stale JS chunk after a new
// deploy while a tab sat open for days, anything unexpected) took the
// whole React tree down with it — nothing left to show, just a blank
// page. Confirmed live via a coach's own screen recording. Reusing the
// same RefreshButton/SessionResetButton already built for the header
// here too, rather than duplicating that logic, so "try a plain reload
// first, sign out if that's not enough" stays one consistent recovery
// path whether the user finds it via the header or hits a real crash.
// Self-contained inline styles (no CSS-module classes) since this
// renders precisely when something upstream may have gone wrong — it
// shouldn't depend on anything else in the tree still working.
//
// `standalone` controls the background: a group-level boundary
// ((coach|student|admin)/error.tsx) only replaces that layout's
// {children} slot — the layout itself (and its dark background) stays
// mounted around it, so it needs none of its own. The root-level
// app/error.tsx is different: it fires for anything that escapes a
// group's own boundary (most notably an error thrown by the group
// layout itself), which means the group's dark wrapper is gone too and
// this renders directly inside the root layout's plain white body —
// confirmed live (a real bug caught by testing this component, not
// theorized): the default light text was invisible against that white
// background. `standalone` supplies its own dark full-bleed backdrop
// for exactly that case.
export default function DashboardError({
  error,
  reset,
  standalone = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  standalone?: boolean;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: standalone ? "100vh" : "50vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 32,
        textAlign: "center",
        color: "#f4f0e6",
        ...(standalone ? { background: "#0d0d14" } : {}),
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong.</p>
      <p style={{ fontSize: 14, opacity: 0.7, maxWidth: 420, margin: 0 }}>
        This screen hit an unexpected error. Try again below — if it keeps happening, use
        &quot;Fix stuck screen&quot; to sign out and back in.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded border border-[#2c2c3d] bg-[#20202f] px-3 py-1.5 text-sm text-[#f4f0e6] hover:bg-[#2c2c3d]"
        >
          Try again
        </button>
        <RefreshButton dark />
        <SessionResetButton dark />
      </div>
      {error.digest && (
        <p style={{ fontSize: 11, opacity: 0.4, margin: 0 }}>Error ref: {error.digest}</p>
      )}
    </div>
  );
}
