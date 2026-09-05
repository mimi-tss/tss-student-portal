"use client";

import DashboardError from "@/components/dashboard-error";

// Catches any uncaught error from a page inside this route group (does
// NOT catch an error thrown by (admin)/layout.tsx itself — that bubbles
// up to the root app/error.tsx instead). See dashboard-error.tsx for
// why this exists.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <DashboardError error={error} reset={reset} />;
}
