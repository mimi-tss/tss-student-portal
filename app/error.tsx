"use client";

import DashboardError from "@/components/dashboard-error";

// Root-level safety net: an error thrown inside (coach)/(student)/
// (admin)'s own layout.tsx (the requireRole check, the coach/student
// name lookup, the sidebar's overview-stats fetch, etc.) escapes that
// group's own error.tsx — a layout's errors are only caught by an
// ANCESTOR boundary, never its own segment's — so without this, that
// exact class of failure would still blank the whole page, header
// included. This is what actually would have caught the coach's
// real blank-screen report if it originated in the layout itself
// rather than a page. Also covers anything outside all three groups
// (e.g. /login). See dashboard-error.tsx for the shared UI/rationale.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <DashboardError error={error} reset={reset} standalone />;
}
