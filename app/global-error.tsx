"use client";

import { useEffect } from "react";
import RefreshButton from "@/components/refresh-button";
import SessionResetButton from "@/components/session-reset-button";

// Last-resort boundary: only fires if app/layout.tsx itself throws
// (the root layout is trivial today — just <html>/<body> and metadata —
// so this should be rare, but Next.js requires a global-error.tsx to
// catch that specific case, and it's cheap insurance). Unlike every
// other error.tsx here, this one replaces the ENTIRE document, so it
// has to supply its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 32,
          textAlign: "center",
          background: "#0d0d14",
          color: "#f4f0e6",
          fontFamily: "sans-serif",
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong.</p>
        <p style={{ fontSize: 14, opacity: 0.7, maxWidth: 420, margin: 0 }}>
          This page hit an unexpected error. Try again below — if it keeps happening, use
          &quot;Fix stuck screen&quot; to sign out and back in.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: 4,
              border: "1px solid #2c2c3d",
              background: "#20202f",
              color: "#f4f0e6",
              padding: "6px 12px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <RefreshButton dark />
          <SessionResetButton dark />
        </div>
        {error.digest && (
          <p style={{ fontSize: 11, opacity: 0.4, margin: 0 }}>Error ref: {error.digest}</p>
        )}
      </body>
    </html>
  );
}
